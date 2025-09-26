# Production Deployment Guide

This guide covers how to deploy your Discord Calendar Sync Bot to production for 24/7 operation.

## 🚀 Deployment Options Overview

### Option 1: VPS/Cloud Server (Recommended)
- **Best for**: Full control, reliability, cost-effectiveness
- **Cost**: $3.50-10/month
- **Uptime**: 99.9%+
- **Difficulty**: Moderate

### Option 2: Platform-as-a-Service (Easiest)
- **Best for**: Quick deployment, minimal maintenance
- **Cost**: $0-7/month
- **Uptime**: 99%+
- **Difficulty**: Easy

### Option 3: Container Hosting
- **Best for**: Scalability, modern deployment
- **Cost**: $5-15/month
- **Uptime**: 99.9%+
- **Difficulty**: Easy-Moderate

---

## 💰 Cost Comparison

| Provider | Plan | Cost/Month | Free Tier | Pros | Cons |
|----------|------|------------|-----------|------|------|
| **Vultr** | VPS | $3.50 | No | Cheapest, full control | Requires setup |
| **DigitalOcean** | Droplet | $6.00 | $200 credit | Great docs, reliable | None |
| **Railway** | Hobby | $5.00 | Yes (500hrs) | Easiest deployment | Limited free tier |
| **Render** | Web Service | $7.00 | Yes (750hrs) | Simple, good free tier | Can sleep |
| **AWS EC2** | t2.micro | $8.50 | 12mo free | Industry standard | Complex setup |
| **Google Cloud** | e2-micro | $6.50 | Always free | Good integration | Complex setup |
| **Heroku** | Basic | $7.00 | No longer free | Very easy | More expensive |

---

## 🖥️ Option 1: VPS/Cloud Server (Recommended)

### Providers
- **[DigitalOcean](https://digitalocean.com)** - Most popular, great documentation
- **[Vultr](https://vultr.com)** - Cheapest option
- **[Linode](https://linode.com)** - Good performance
- **[AWS EC2](https://aws.amazon.com/ec2)** - Industry standard
- **[Google Cloud VM](https://cloud.google.com/compute)** - Good integration

### Step-by-Step Setup (DigitalOcean Example)

#### 1. Create Server
```bash
# Sign up at digitalocean.com
# Create new Droplet:
# - Ubuntu 22.04 LTS
# - Basic plan ($6/month)
# - Choose datacenter region
# - Add SSH key (recommended)
```

#### 2. Connect to Server
```bash
ssh root@your_server_ip
```

#### 3. Install Dependencies
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Install Git
apt-get install git -y

# Verify installations
node --version  # Should show v18.x.x
npm --version
pm2 --version
```

#### 4. Deploy Your Code
```bash
# Option A: Clone from GitHub (recommended)
git clone https://github.com/yourusername/discord-calendar-sync.git
cd discord-calendar-sync

# Option B: Upload files manually
# Use scp or SFTP to upload your project folder

# Install dependencies
npm install --production
```

#### 5. Configure Environment
```bash
# Create production environment file
cp .env.example .env
nano .env

# Edit with your production values:
NODE_ENV=production
LOG_LEVEL=warn
DISCORD_TOKEN=your_production_token
GUILD_ID=your_production_guild_id
GOOGLE_CALENDAR_ID=your_calendar_id
SYNC_INTERVAL_MINUTES=5
HEALTH_CHECK_PORT=3000
```

#### 6. Upload Google Credentials
```bash
# From your local machine:
scp credentials.json root@your_server_ip:/root/discord-calendar-sync/

# Or edit directly on server:
nano credentials.json
# Paste your Google service account JSON
```

#### 7. Start with PM2
```bash
# Start the bot
pm2 start discord-calendar.js --name "discord-calendar-bot"

# View status
pm2 status

# View logs
pm2 logs discord-calendar-bot

# Save PM2 configuration
pm2 save

# Set up auto-start on boot
pm2 startup
# Follow the instructions (run the command it shows)

# Save again
pm2 save
```

#### 8. Security Setup
```bash
# Set up firewall
ufw enable
ufw allow ssh
ufw allow 3000  # For health checks

# Create non-root user (recommended)
adduser discordbot
usermod -aG sudo discordbot

# Switch to new user for running bot
su - discordbot
# Repeat deployment steps as this user
```

#### 9. Test Deployment
```bash
# Check if bot is running
pm2 status

# Test health endpoint
curl http://localhost:3000/health

# Check logs
pm2 logs discord-calendar-bot --lines 50

# Monitor in real-time
pm2 monit
```

---

## 🚀 Option 2: Platform-as-a-Service

### Railway (Easiest Option)

#### Setup Steps
1. **Sign up** at [railway.app](https://railway.app)
2. **Connect GitHub** repository
3. **Create new project** → "Deploy from GitHub repo"
4. **Select your repository**
5. **Add environment variables** in Railway dashboard:
   ```
   NODE_ENV=production
   LOG_LEVEL=warn
   DISCORD_TOKEN=your_token
   GUILD_ID=your_guild_id
   GOOGLE_CALENDAR_ID=your_calendar_id
   ```
6. **Upload credentials.json** via Railway Files tab
7. **Deploy automatically!**

#### Pricing
- **Free Tier**: 500 hours/month, $0.000463/GB-hour
- **Pro Plan**: $5/month unlimited

### Render

#### Setup Steps
1. **Sign up** at [render.com](https://render.com)
2. **New** → **Web Service**
3. **Connect GitHub** repository
4. **Configure:**
   - Build Command: `npm install`
   - Start Command: `node discord-calendar.js`
5. **Add environment variables**
6. **Upload credentials.json** via Render dashboard
7. **Deploy**

#### Pricing
- **Free Tier**: 750 hours/month (sleeps after 15min inactivity)
- **Starter Plan**: $7/month (no sleeping)

### Heroku

#### Setup Steps
```bash
# Install Heroku CLI
# Create new app
heroku create your-bot-name

# Add environment variables
heroku config:set DISCORD_TOKEN=your_token
heroku config:set GUILD_ID=your_guild_id
heroku config:set NODE_ENV=production

# Add credentials.json as config var (base64 encoded)
heroku config:set GOOGLE_CREDENTIALS="$(cat credentials.json | base64)"

# Deploy
git push heroku main
```

#### Pricing
- **Basic Plan**: $7/month

---

## 🐳 Option 3: Container Hosting

### Fly.io

#### Setup Steps
```bash
# Install flyctl CLI
# Initialize in your project
fly launch

# Configure fly.toml
# Add secrets
fly secrets set DISCORD_TOKEN=your_token
fly secrets set GUILD_ID=your_guild_id

# Deploy
fly deploy
```

### Google Cloud Run

#### Setup Steps
```bash
# Build container
docker build -t discord-calendar-sync .

# Push to Google Container Registry
docker tag discord-calendar-sync gcr.io/your-project/discord-calendar-sync
docker push gcr.io/your-project/discord-calendar-sync

# Deploy to Cloud Run
gcloud run deploy --image gcr.io/your-project/discord-calendar-sync
```

---

## 📊 Monitoring & Maintenance

### Health Monitoring

#### Manual Checks
```bash
# Check bot status
curl http://your-server:3000/health

# PM2 commands (VPS only)
pm2 status
pm2 logs discord-calendar-bot
pm2 restart discord-calendar-bot
pm2 monit
```

#### Automated Monitoring
Set up monitoring with:
- **Uptime Robot** (free)
- **Pingdom**
- **New Relic**
- **DataDog**

### Log Management

#### VPS (PM2)
```bash
# View logs
pm2 logs discord-calendar-bot --lines 100

# Clear logs
pm2 flush

# Log rotation (automatic with PM2)
pm2 install pm2-logrotate
```

#### Platform Services
- Most platforms provide built-in log management
- Check your provider's dashboard

### Updates

#### VPS Method
```bash
# Create update script
nano /root/update-bot.sh

#!/bin/bash
cd /root/discord-calendar-sync
git pull
npm install --production
pm2 restart discord-calendar-bot

chmod +x /root/update-bot.sh

# Run updates
./update-bot.sh
```

#### Platform Method
- Most platforms auto-deploy on git push
- Some support branch-based deployments

---

## 🔧 Troubleshooting

### Common Issues

#### Bot Goes Offline
```bash
# Check PM2 status
pm2 status

# Restart if crashed
pm2 restart discord-calendar-bot

# Check logs for errors
pm2 logs discord-calendar-bot
```

#### Memory Issues
```bash
# Check memory usage
pm2 monit

# If memory leak, restart periodically
pm2 restart discord-calendar-bot --cron-restart="0 2 * * *"  # Daily at 2 AM
```

#### Permission Errors
```bash
# Fix file permissions
chown -R discordbot:discordbot /path/to/bot
chmod +x discord-calendar.js
```

### Performance Optimization

#### Environment Settings
```env
NODE_ENV=production
LOG_LEVEL=warn  # Reduce log verbosity
SYNC_INTERVAL_MINUTES=5  # Don't make too frequent
```

#### PM2 Settings
```bash
# Limit memory usage
pm2 start discord-calendar.js --max-memory-restart 500M

# Enable cluster mode (if needed)
pm2 start discord-calendar.js -i 2
```

---

## 📋 Production Checklist

### Pre-Deployment
- [ ] Test bot locally with production credentials
- [ ] Create production Discord bot (separate from development)
- [ ] Set up production Google Calendar API project
- [ ] Create production environment variables
- [ ] Test health endpoint

### Post-Deployment
- [ ] Verify bot shows online in Discord
- [ ] Test event sync in both directions
- [ ] Set up monitoring/alerting
- [ ] Document server access details
- [ ] Set up automated backups (if using VPS)

### Security
- [ ] Use strong passwords/SSH keys
- [ ] Enable firewall
- [ ] Run bot as non-root user
- [ ] Keep credentials secure
- [ ] Regular security updates

---

## 🎯 Recommended Setup

**For beginners**: Railway or Render (Platform-as-a-Service)
**For control/cost**: DigitalOcean VPS with PM2
**For enterprise**: AWS/GCP with proper monitoring

**Most popular choice**: DigitalOcean ($6/month) + PM2 for reliability and cost-effectiveness.

---

## 📞 Support

If you encounter issues:

1. **Check logs** first (most issues show up here)
2. **Verify credentials** (Discord token, Google Calendar API)
3. **Test health endpoint** (`curl http://your-server:3000/health`)
4. **Check Discord bot permissions** in server
5. **Verify Google Calendar sharing** with service account

For platform-specific issues, consult the provider's documentation or support.