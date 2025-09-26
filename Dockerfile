# Use Node.js 18 LTS Alpine image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discord-bot -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=discord-bot:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown discord-bot:nodejs logs

# Create data directory for event mappings
RUN mkdir -p data && chown discord-bot:nodejs data

# Switch to non-root user
USER discord-bot

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node health.js || exit 1

# Expose health check port
EXPOSE 3000

# Start the application
CMD ["node", "discord-calendar.js"]