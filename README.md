# Discord Calendar Sync Bot

A production-ready Discord bot that automatically syncs Google Calendar events to Discord scheduled events. The bot runs continuously, checking for calendar updates every 5 minutes and maintaining perfect synchronization between your Google Calendar and Discord server.

## Features

- 🔄 **Automatic Sync**: Syncs Google Calendar events to Discord scheduled events every 5 minutes
- 📅 **Full Event Management**: Creates, updates, and deletes Discord events based on calendar changes
- 🛡️ **Robust Error Handling**: Retry logic with exponential backoff for API failures
- 🚦 **Rate Limiting**: Built-in protection against Discord and Google API rate limits
- 💾 **Persistent Storage**: Event mappings survive bot restarts
- 📊 **Health Monitoring**: Built-in health check endpoint for monitoring
- 🐳 **Docker Ready**: Containerized deployment with Docker Compose
- 🔧 **Production Ready**: PM2 process management and comprehensive logging

## Quick Start

### Prerequisites

- Node.js 18+
- Discord Bot Token
- Google Service Account with Calendar API access
- Discord Server with Manage Events permission

### Installation

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd discord-calendar-sync
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Set up Google Calendar API**
   ```bash
   cp credentials.json.example credentials.json
   # Add your Google service account credentials
   ```

4. **Run the Bot**
   ```bash
   npm start
   ```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ | Your Discord bot token |
| `GUILD_ID` | ✅ | Discord server ID where events will be created |
| `GOOGLE_CALENDAR_ID` | ❌ | Google Calendar ID (defaults to primary) |
| `SYNC_INTERVAL_MINUTES` | ❌ | Sync frequency in minutes (default: 5) |
| `LOG_LEVEL` | ❌ | Logging level: debug, info, warn, error (default: info) |

See `.env.example` for all available configuration options.

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and bot
3. Copy the bot token to your `.env` file
4. Invite the bot to your server with these permissions:
   - View Channels
   - Manage Events
   - Create Events

### Google Calendar API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the Google Calendar API
4. Create a service account and download the JSON key
5. Save the key as `credentials.json`
6. Share your calendar with the service account email

## Deployment

### Docker (Recommended)

```bash
# Build and run with Docker Compose
npm run docker:run

# Stop the service
npm run docker:stop
```

### PM2 (Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
npm run pm2:start

# Monitor logs
npm run pm2:logs
```

### Manual

```bash
# Development with auto-restart
npm run dev

# Production
npm start
```

## Monitoring

### Health Check

The bot exposes a health check endpoint on port 3000:

```bash
curl http://localhost:3000/health
```

### Logs

- **Development**: Console output with timestamps
- **Production**: Log files in `./logs/` directory
- **Docker**: Container logs via `docker logs`

## API Documentation

See [API.md](./API.md) for detailed API documentation.

## Setup Guide

See [SETUP.md](./SETUP.md) for detailed setup instructions.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the bot in production mode |
| `npm run dev` | Start with auto-restart for development |
| `npm test` | Run test suite |
| `npm run lint` | Check code style |
| `npm run format` | Format code with Prettier |
| `npm run health` | Run health check |

## Troubleshooting

### Common Issues

1. **"Guild not found" error**
   - Verify `GUILD_ID` is correct
   - Ensure bot is in the server

2. **"Failed to setup Google Auth" error**
   - Check `credentials.json` format
   - Verify service account has Calendar API access

3. **Rate limiting errors**
   - Bot automatically handles rate limits
   - Check logs for retry attempts

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- Create an issue for bugs or feature requests
- Check the logs first for error details
- Include your environment and configuration (without secrets)