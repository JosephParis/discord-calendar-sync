const http = require('http');
const config = require('./config');

class HealthServer {
  constructor() {
    this.server = null;
    this.port = config.app.healthCheckPort;
  }

  async start() {
    this.server = http.createServer(async (req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        try {
          const healthStatus = await this.getHealthStatus();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(healthStatus, null, 2));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
          }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    this.server.listen(this.port, () => {
      console.log(`Health check server running on port ${this.port}`);
    });

    return this.server;
  }

  async stop() {
    if (this.server) {
      this.server.close();
    }
  }

  async getHealthStatus() {
    // Try to load the main bot module to check its health
    try {
      const CalendarSyncBot = require('./discord-calendar');

      // Basic health check - ensure the module loads
      const status = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: config.app.environment,
        version: require('./package.json').version
      };

      return status;
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }
}

// If this file is run directly (for Docker health checks)
if (require.main === module) {
  const healthServer = new HealthServer();

  // Quick health check for Docker
  healthServer.getHealthStatus()
    .then(() => {
      console.log('Health check passed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Health check failed:', error.message);
      process.exit(1);
    });
} else {
  // Export for use as a module
  module.exports = HealthServer;
}