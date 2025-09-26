const { Client, GatewayIntentBits, ScheduledEvent } = require('discord.js');
const { google } = require('googleapis');
const fs = require('fs').promises;
const cron = require('node-cron');
const path = require('path');

class CalendarSyncBot {
    constructor() {
        // Load config (which loads .env)
        this.config = require('./config');

        // Validate environment variables
        this.validateConfig();

        // Discord client setup
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildScheduledEvents
            ]
        });

        // Google Calendar setup
        this.calendar = null;
        this.auth = null;

        // Sync mappings - separate tracking for each direction
        this.googleToDiscordMap = new Map(); // Google Event ID -> Discord Event ID
        this.discordToGoogleMap = new Map(); // Discord Event ID -> Google Event ID
        this.mappingsFile = path.join(__dirname, 'event-mappings.json');

        // Track events currently being synced to prevent loops
        this.currentlySyncing = new Set();

        // Rate limiting
        this.discordQueue = [];
        this.googleQueue = [];
        this.discordRateLimit = { requests: 0, resetTime: Date.now() };
        this.googleRateLimit = { requests: 0, resetTime: Date.now() };

        this.setupDiscordEvents();
        this.setupGoogleAuth();
        this.loadEventMappings();
        this.startRateLimitProcessor();
    }

    validateConfig() {
        this.config.validate();
        this.log('info', 'Configuration validated successfully');
    }

    log(level, message, error = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

        if (level === 'error') {
            console.error(logMessage);
            if (error) console.error(error);
        } else if (level === 'warn') {
            console.warn(logMessage);
        } else {
            console.log(logMessage);
        }
    }

    async loadEventMappings() {
        try {
            const data = await fs.readFile(this.mappingsFile, 'utf8');
            const mappings = JSON.parse(data);

            // Load both directions
            this.googleToDiscordMap = new Map(Object.entries(mappings.googleToDiscord || {}));
            this.discordToGoogleMap = new Map(Object.entries(mappings.discordToGoogle || {}));

            this.log('info', `Loaded ${this.googleToDiscordMap.size} Google→Discord and ${this.discordToGoogleMap.size} Discord→Google mappings`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.log('warn', 'Failed to load event mappings, starting fresh', error);
            } else {
                this.log('info', 'No existing event mappings found, starting fresh');
            }
        }
    }

    async saveEventMappings() {
        try {
            const mappings = {
                googleToDiscord: Object.fromEntries(this.googleToDiscordMap),
                discordToGoogle: Object.fromEntries(this.discordToGoogleMap)
            };
            await fs.writeFile(this.mappingsFile, JSON.stringify(mappings, null, 2));
            this.log('debug', 'Event mappings saved');
        } catch (error) {
            this.log('error', 'Failed to save event mappings', error);
        }
    }

    startRateLimitProcessor() {
        // Process Discord queue (50 requests per second)
        setInterval(() => {
            if (Date.now() > this.discordRateLimit.resetTime) {
                this.discordRateLimit.requests = 0;
                this.discordRateLimit.resetTime = Date.now() + 1000;
            }

            while (this.discordQueue.length > 0 && this.discordRateLimit.requests < 50) {
                const { fn, resolve, reject } = this.discordQueue.shift();
                this.discordRateLimit.requests++;
                fn().then(resolve).catch(reject);
            }
        }, 20);

        // Process Google queue (100 requests per 100 seconds)
        setInterval(() => {
            if (Date.now() > this.googleRateLimit.resetTime) {
                this.googleRateLimit.requests = 0;
                this.googleRateLimit.resetTime = Date.now() + 100000;
            }

            while (this.googleQueue.length > 0 && this.googleRateLimit.requests < 100) {
                const { fn, resolve, reject } = this.googleQueue.shift();
                this.googleRateLimit.requests++;
                fn().then(resolve).catch(reject);
            }
        }, 1000);
    }

    async queueDiscordRequest(fn) {
        return new Promise((resolve, reject) => {
            this.discordQueue.push({ fn, resolve, reject });
        });
    }

    async queueGoogleRequest(fn) {
        return new Promise((resolve, reject) => {
            this.googleQueue.push({ fn, resolve, reject });
        });
    }

    async retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }

                const delay = baseDelay * Math.pow(2, attempt - 1);
                this.log('warn', `Attempt ${attempt} failed, retrying in ${delay}ms`, error);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async setupGoogleAuth() {
        await this.retryOperation(async () => {
            try {
                const credentials = JSON.parse(await fs.readFile('credentials.json', 'utf8'));

                this.auth = new google.auth.GoogleAuth({
                    credentials: credentials,
                    scopes: ['https://www.googleapis.com/auth/calendar']
                });

                this.calendar = google.calendar({ version: 'v3', auth: this.auth });
                this.log('info', 'Google Calendar API initialized');
            } catch (error) {
                this.log('error', 'Failed to setup Google Auth', error);
                throw error;
            }
        });
    }

    setupDiscordEvents() {
        this.client.once('ready', () => {
            this.log('info', `Bot logged in as ${this.client.user.tag}`);
            this.log('info', `Bot is in ${this.client.guilds.cache.size} guilds`);

            const guild = this.client.guilds.cache.get(this.config.discord.guildId);
            if (guild) {
                this.log('info', `Found target guild: ${guild.name}`);
                this.log('info', `Guild has ${guild.scheduledEvents.cache.size} scheduled events`);
            } else {
                this.log('error', `Target guild not found: ${this.config.discord.guildId}`);
            }

            this.startSyncSchedule();
        });

        this.client.on('error', (error) => {
            this.log('error', 'Discord client error', error);
        });

        this.client.on('rateLimit', (rateLimitData) => {
            this.log('warn', `Discord rate limit hit: ${rateLimitData.timeout}ms timeout`);
        });

        // Listen for Discord scheduled events changes
        this.client.on('guildScheduledEventCreate', (event) => {
            this.log('debug', `Discord event created: ${event.name} (ID: ${event.id})`);
            this.handleDiscordEventCreate(event);
        });

        this.client.on('guildScheduledEventUpdate', (oldEvent, newEvent) => {
            this.log('debug', `Discord event updated: ${newEvent.name} (ID: ${newEvent.id})`);
            this.handleDiscordEventUpdate(oldEvent, newEvent);
        });

        this.client.on('guildScheduledEventDelete', (event) => {
            this.log('debug', `Discord event deleted: ${event.name} (ID: ${event.id})`);
            this.handleDiscordEventDelete(event);
        });
    }

    startSyncSchedule() {
        // Sync every 5 minutes
        cron.schedule('*/5 * * * *', () => {
            this.syncCalendarToDiscord();
        });

        // Initial sync
        this.syncCalendarToDiscord();
    }

    async syncCalendarToDiscord() {
        await this.retryOperation(async () => {
            try {
                this.log('info', 'Starting calendar sync...');

                const calendarEvents = await this.getUpcomingCalendarEvents();

                const guild = this.client.guilds.cache.get(this.config.discord.guildId);
                if (!guild) {
                    throw new Error('Guild not found');
                }

                for (const calEvent of calendarEvents) {
                    await this.processCalendarEvent(guild, calEvent);
                }

                await this.cleanupDeletedEvents(guild, calendarEvents);
                await this.saveEventMappings();

                this.log('info', `Calendar sync completed - processed ${calendarEvents.length} events`);
            } catch (error) {
                this.log('error', 'Sync failed', error);
                throw error;
            }
        });
    }

    async getUpcomingCalendarEvents() {
        return await this.queueGoogleRequest(async () => {
            const now = new Date();
            const oneMonthLater = new Date();
            oneMonthLater.setMonth(now.getMonth() + 1);

            const response = await this.calendar.events.list({
                calendarId: this.config.google.calendarId,
                timeMin: now.toISOString(),
                timeMax: oneMonthLater.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            this.log('debug', `Retrieved ${response.data.items?.length || 0} calendar events`);
            return response.data.items || [];
        });
    }

    async processCalendarEvent(guild, calEvent) {
        const syncKey = `google_process_${calEvent.id}`;

        // Prevent sync loops
        if (this.currentlySyncing.has(syncKey)) {
            return;
        }

        this.currentlySyncing.add(syncKey);

        try {
            await this.retryOperation(async () => {
                const existingDiscordEventId = this.googleToDiscordMap.get(calEvent.id);

                this.log('debug', `Processing Google event: ${calEvent.summary}`);
                this.log('debug', `Existing Discord event ID: ${existingDiscordEventId}`);

                if (existingDiscordEventId) {
                    this.log('info', `Updating existing Discord event: ${calEvent.summary}`);
                    await this.updateDiscordEvent(guild, existingDiscordEventId, calEvent);
                } else {
                    this.log('info', `Creating new Discord event: ${calEvent.summary}`);
                    await this.createDiscordEvent(guild, calEvent);
                }
            });
        } finally {
            this.currentlySyncing.delete(syncKey);
        }
    }

    async createDiscordEvent(guild, calEvent) {
        return await this.queueDiscordRequest(async () => {
            try {
                const startTime = new Date(calEvent.start.dateTime || calEvent.start.date);
                const endTime = new Date(calEvent.end.dateTime || calEvent.end.date);

                // Pre-add to currently syncing BEFORE creating the Discord event
                // This prevents the Discord event listener from immediately triggering
                const tempDiscordId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const discordSyncKey = `discord_create_${tempDiscordId}`;
                this.currentlySyncing.add(discordSyncKey);

                const discordEvent = await guild.scheduledEvents.create({
                    name: calEvent.summary || 'Untitled Event',
                    description: this.formatEventDescription(calEvent),
                    scheduledStartTime: startTime,
                    scheduledEndTime: endTime,
                    privacyLevel: 2, // GUILD_ONLY
                    entityType: 3, // EXTERNAL (since it's from Google Calendar)
                    entityMetadata: {
                        location: calEvent.location || 'See calendar for details'
                    }
                });

                // Now add the real Discord event ID to syncing protection
                const realDiscordSyncKey = `discord_create_${discordEvent.id}`;
                this.currentlySyncing.add(realDiscordSyncKey);
                this.currentlySyncing.delete(discordSyncKey); // Remove temp key

                // Store bidirectional mapping IMMEDIATELY
                this.googleToDiscordMap.set(calEvent.id, discordEvent.id);
                this.discordToGoogleMap.set(discordEvent.id, calEvent.id);

                await this.saveEventMappings();

                // Remove from syncing after a delay
                setTimeout(() => {
                    this.currentlySyncing.delete(realDiscordSyncKey);
                }, 2000);

                this.log('info', `Successfully synced Google→Discord: ${calEvent.summary}`);
                return discordEvent;
            } catch (error) {
                this.log('error', `Failed to create Discord event for ${calEvent.summary}`, error);
                throw error;
            }
        });
    }

    async updateDiscordEvent(guild, discordEventId, calEvent) {
        return await this.queueDiscordRequest(async () => {
            try {
                const discordEvent = guild.scheduledEvents.cache.get(discordEventId);
                if (!discordEvent) {
                    // Clean up broken mappings
                    this.googleToDiscordMap.delete(calEvent.id);
                    this.discordToGoogleMap.delete(discordEventId);
                    this.log('warn', `Discord event ${discordEventId} no longer exists, creating new one`);
                    await this.createDiscordEvent(guild, calEvent);
                    return;
                }

                const startTime = new Date(calEvent.start.dateTime || calEvent.start.date);
                const endTime = new Date(calEvent.end.dateTime || calEvent.end.date);

                await discordEvent.edit({
                    name: calEvent.summary || 'Untitled Event',
                    description: this.formatEventDescription(calEvent),
                    scheduledStartTime: startTime,
                    scheduledEndTime: endTime,
                    entityMetadata: {
                        location: calEvent.location || 'See calendar for details'
                    }
                });

                this.log('info', `Updated Discord event: ${calEvent.summary}`);
            } catch (error) {
                this.log('error', `Failed to update Discord event for ${calEvent.summary}`, error);
                throw error;
            }
        });
    }

    async cleanupDeletedEvents(guild, currentCalendarEvents) {
        const currentCalendarEventIds = new Set(currentCalendarEvents.map(e => e.id));

        const deletedEventIds = [];
        for (const [calEventId, discordEventId] of this.googleToDiscordMap.entries()) {
            if (!currentCalendarEventIds.has(calEventId)) {
                deletedEventIds.push({ calEventId, discordEventId });
            }
        }

        for (const { calEventId, discordEventId } of deletedEventIds) {
            await this.retryOperation(async () => {
                await this.queueDiscordRequest(async () => {
                    try {
                        const discordEvent = guild.scheduledEvents.cache.get(discordEventId);
                        if (discordEvent) {
                            await discordEvent.delete();
                            this.log('info', `Deleted Discord event: ${discordEvent.name}`);
                        }
                        // Remove from both mappings
                        this.googleToDiscordMap.delete(calEventId);
                        this.discordToGoogleMap.delete(discordEventId);
                    } catch (error) {
                        this.log('error', `Failed to delete Discord event ${discordEventId}`, error);
                        throw error;
                    }
                });
            });
        }

        if (deletedEventIds.length > 0) {
            this.log('info', `Cleaned up ${deletedEventIds.length} deleted events`);
        }
    }

    formatEventDescription(calEvent) {
        let description = '';
        
        if (calEvent.description) {
            // Truncate to Discord's limit (1000 characters for event descriptions)
            description = calEvent.description.substring(0, 800);
        }

        if (calEvent.htmlLink) {
            description += `\n\n[View in Google Calendar](${calEvent.htmlLink})`;
        }

        return description || 'No description available';
    }

    // Discord → Google Calendar sync methods
    async handleDiscordEventCreate(discordEvent) {
        const syncKey = `discord_create_${discordEvent.id}`;

        this.log('debug', `=== DISCORD EVENT CREATE HANDLER ===`);
        this.log('debug', `Event: ${discordEvent.name} (ID: ${discordEvent.id})`);
        this.log('debug', `Entity Type: ${discordEvent.entityType}`);
        this.log('debug', `Creator: ${discordEvent.creator?.username || 'unknown'}`);
        this.log('debug', `Description: ${discordEvent.description?.substring(0, 100) || 'none'}`);
        this.log('debug', `Currently syncing: ${Array.from(this.currentlySyncing).join(', ') || 'none'}`);
        this.log('debug', `Google→Discord mappings: ${this.googleToDiscordMap.size}`);
        this.log('debug', `Discord→Google mappings: ${this.discordToGoogleMap.size}`);

        // Prevent sync loops
        if (this.currentlySyncing.has(syncKey)) {
            this.log('debug', `❌ Skipping ${discordEvent.name} - currently syncing`);
            return;
        }

        // Skip if this Discord event was created from a Google event
        const isFromGoogle = Array.from(this.googleToDiscordMap.values()).includes(discordEvent.id);
        if (isFromGoogle) {
            this.log('debug', `❌ Skipping ${discordEvent.name} - was created from Google Calendar`);
            return;
        }

        // Check if this event was created by our bot specifically
        const isBotCreated = discordEvent.creator && discordEvent.creator.bot &&
                           discordEvent.creator.id === this.client.user.id;

        if (isBotCreated) {
            this.log('debug', `❌ Skipping ${discordEvent.name} - created by this bot`);
            return;
        }

        // Additional check: if description contains our specific Google Calendar link pattern
        if (discordEvent.description && discordEvent.description.includes('[View in Google Calendar]') &&
            !discordEvent.description.includes('Synced from Discord')) {
            this.log('debug', `❌ Skipping ${discordEvent.name} - appears to be synced from Google Calendar`);
            return;
        }

        // Skip if we already have a Google event for this Discord event
        if (this.discordToGoogleMap.has(discordEvent.id)) {
            this.log('debug', `❌ Skipping ${discordEvent.name} - already has Google Calendar event`);
            return;
        }

        this.log('debug', `✅ All checks passed - proceeding with sync`);
        this.currentlySyncing.add(syncKey);
        this.log('info', `🔄 Syncing Discord→Google: ${discordEvent.name}`);

        try {
            this.log('info', `Creating Google Calendar event from Discord: ${discordEvent.name}`);
            const calendarEvent = await this.createGoogleCalendarEvent(discordEvent);

            // Store bidirectional mapping IMMEDIATELY
            this.discordToGoogleMap.set(discordEvent.id, calendarEvent.id);
            this.googleToDiscordMap.set(calendarEvent.id, discordEvent.id);
            await this.saveEventMappings();

            this.log('info', `Successfully synced Discord→Google: ${discordEvent.name}`);
        } catch (error) {
            this.log('error', `Failed to create Google Calendar event from Discord`, error);
        } finally {
            this.currentlySyncing.delete(syncKey);
        }
    }

    async handleDiscordEventUpdate(oldEvent, newEvent) {
        const syncKey = `discord_update_${newEvent.id}`;

        // Prevent sync loops
        if (this.currentlySyncing.has(syncKey)) {
            return;
        }

        // Only sync if this Discord event has a corresponding Google event
        if (!this.discordToGoogleMap.has(newEvent.id)) {
            return;
        }

        this.currentlySyncing.add(syncKey);

        try {
            this.log('info', `Updating Google Calendar event from Discord: ${newEvent.name}`);
            await this.updateGoogleCalendarEvent(newEvent);
        } catch (error) {
            this.log('error', `Failed to update Google Calendar event from Discord`, error);
        } finally {
            this.currentlySyncing.delete(syncKey);
        }
    }

    async handleDiscordEventDelete(discordEvent) {
        const syncKey = `discord_delete_${discordEvent.id}`;

        // Prevent sync loops
        if (this.currentlySyncing.has(syncKey)) {
            return;
        }

        // Only sync if this Discord event has a corresponding Google event
        if (!this.discordToGoogleMap.has(discordEvent.id)) {
            return;
        }

        this.currentlySyncing.add(syncKey);

        try {
            this.log('info', `Deleting Google Calendar event from Discord: ${discordEvent.name}`);
            await this.deleteGoogleCalendarEvent(discordEvent);
        } catch (error) {
            this.log('error', `Failed to delete Google Calendar event from Discord`, error);
        } finally {
            this.currentlySyncing.delete(syncKey);
        }
    }


    async createGoogleCalendarEvent(discordEvent) {
        return await this.queueGoogleRequest(async () => {
            this.log('debug', `=== CREATING GOOGLE CALENDAR EVENT ===`);
            this.log('debug', `Discord event name: ${discordEvent.name}`);
            this.log('debug', `Discord event start time: ${discordEvent.scheduledStartAt}`);
            this.log('debug', `Discord event end time: ${discordEvent.scheduledEndAt}`);
            this.log('debug', `Discord event location: ${discordEvent.entityMetadata?.location || 'none'}`);

            const startTime = discordEvent.scheduledStartAt ? discordEvent.scheduledStartAt : new Date(discordEvent.scheduledStartTimestamp);
            const endTime = discordEvent.scheduledEndAt ? discordEvent.scheduledEndAt : new Date(discordEvent.scheduledEndTimestamp);

            this.log('debug', `Converted start time: ${startTime.toISOString()}`);
            this.log('debug', `Converted end time: ${endTime.toISOString()}`);

            const eventData = {
                summary: discordEvent.name,
                description: `${discordEvent.description || ''}\n\nSynced from Discord`,
                start: {
                    dateTime: startTime.toISOString()
                },
                end: {
                    dateTime: endTime.toISOString()
                }
            };

            if (discordEvent.entityMetadata?.location) {
                eventData.location = discordEvent.entityMetadata.location;
            }

            this.log('debug', `Google Calendar event data: ${JSON.stringify(eventData, null, 2)}`);

            const response = await this.calendar.events.insert({
                calendarId: this.config.google.calendarId,
                resource: eventData
            });

            this.log('info', `✅ Created Google Calendar event: ${discordEvent.name}`);
            return response.data;
        });
    }

    async updateGoogleCalendarEvent(discordEvent) {
        return await this.queueGoogleRequest(async () => {
            const googleEventId = this.discordToGoogleMap.get(discordEvent.id);

            if (!googleEventId) {
                this.log('warn', `No Google Calendar event found for Discord event: ${discordEvent.name}`);
                return;
            }

            const eventData = {
                summary: discordEvent.name,
                description: `${discordEvent.description || ''}\n\nSynced from Discord`,
                start: {
                    dateTime: discordEvent.scheduledStartTimestamp ? new Date(discordEvent.scheduledStartTimestamp).toISOString() : discordEvent.scheduledStartAt.toISOString()
                },
                end: {
                    dateTime: discordEvent.scheduledEndTimestamp ? new Date(discordEvent.scheduledEndTimestamp).toISOString() : discordEvent.scheduledEndAt.toISOString()
                }
            };

            if (discordEvent.entityMetadata?.location) {
                eventData.location = discordEvent.entityMetadata.location;
            }

            await this.calendar.events.update({
                calendarId: this.config.google.calendarId,
                eventId: googleEventId,
                resource: eventData
            });

            this.log('info', `Updated Google Calendar event: ${discordEvent.name}`);
        });
    }

    async deleteGoogleCalendarEvent(discordEvent) {
        return await this.queueGoogleRequest(async () => {
            const googleEventId = this.discordToGoogleMap.get(discordEvent.id);

            if (!googleEventId) {
                this.log('warn', `No Google Calendar event found for Discord event: ${discordEvent.name}`);
                return;
            }

            await this.calendar.events.delete({
                calendarId: this.config.google.calendarId,
                eventId: googleEventId
            });

            // Remove from both mappings
            this.discordToGoogleMap.delete(discordEvent.id);
            this.googleToDiscordMap.delete(googleEventId);
            await this.saveEventMappings();

            this.log('info', `Deleted Google Calendar event: ${discordEvent.name}`);
        });
    }

    async start() {
        await this.retryOperation(async () => {
            await this.client.login(this.config.discord.token);
            this.log('info', 'Discord bot started successfully');
        });
    }

    async stop() {
        try {
            await this.saveEventMappings();
            await this.client.destroy();
            this.log('info', 'Discord bot stopped successfully');
        } catch (error) {
            this.log('error', 'Error during shutdown', error);
        }
    }

    async getHealthStatus() {
        return {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            discord: {
                connected: this.client.isReady(),
                user: this.client.user?.tag || 'Not logged in',
                guilds: this.client.guilds.cache.size
            },
            google: {
                authenticated: !!this.auth,
                calendar: !!this.calendar
            },
            eventMappings: {
                googleToDiscord: this.googleToDiscordMap.size,
                discordToGoogle: this.discordToGoogleMap.size
            },
            queues: {
                discord: this.discordQueue.length,
                google: this.googleQueue.length
            }
        };
    }
}

// Usage
const bot = new CalendarSyncBot();
bot.start().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await bot.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await bot.stop();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    bot.log('error', 'Uncaught exception', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    bot.log('error', 'Unhandled rejection', reason);
});

module.exports = CalendarSyncBot;