require('dotenv').config();

const config = {
  // Discord Configuration
  discord: {
    token: process.env.DISCORD_TOKEN,
    guildId: process.env.GUILD_ID,
    rateLimitPerSecond: parseInt(process.env.DISCORD_RATE_LIMIT_PER_SECOND) || 50
  },

  // Google Calendar Configuration
  google: {
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
    rateLimitPer100Seconds: parseInt(process.env.GOOGLE_RATE_LIMIT_PER_100_SECONDS) || 100
  },

  // Application Configuration
  app: {
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 5,
    healthCheckPort: parseInt(process.env.HEALTH_CHECK_PORT) || 3000
  },

  // Retry Configuration
  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    baseDelayMs: parseInt(process.env.BASE_RETRY_DELAY_MS) || 1000
  },

  // Validation
  validate() {
    const required = {
      'DISCORD_TOKEN': this.discord.token,
      'GUILD_ID': this.discord.guildId
    };

    const missing = Object.keys(required).filter(key => !required[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return true;
  }
};

module.exports = config;