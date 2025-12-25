# Production Deployment Guide

Complete step-by-step guide for deploying the Android Device Management Dashboard to production.

## Architecture Overview

The application consists of two Node.js processes that need to run simultaneously:

1. **Next.js Application Server** (`server.js`) - Port 3000 - Web dashboard and API
2. **Device Server** (`device-server.js`) - Port 9211 - Device communication and Socket.IO

## Prerequisites

- Ubuntu 20.04+ or similar Linux distribution
- Root or sudo access
- Domain name with DNS configured (optional but recommended)
- Supabase project with production credentials

## Step 1: Server Setup

### Initial Server Configuration

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
node --version  # Should be v18.x or higher
npm --version

# Install PM2 globally for process management
sudo npm install -g pm2

# Install Nginx for reverse proxy
sudo apt install -y nginx

# Install SSL certificate tool (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
```

## Step 2: Application Deployment

### Clone and Setup

```bash
# Navigate to deployment directory
cd /var/www

# Clone your repository (replace with your repo URL)
sudo git clone <your-repo-url> android-device-dashboard
cd android-device-dashboard

# Install dependencies
npm install --production

# Build Next.js application
npm run build
```

### Set Proper Permissions

```bash
# Set ownership (replace 'youruser' with your username)
sudo chown -R $USER:$USER /var/www/android-device-dashboard

# Create logs directory
mkdir -p logs

# Secure environment file (will be created in next step)
chmod 600 .env.production 2>/dev/null || true
```

## Step 3: Environment Configuration

### Create Production Environment File

Create `/var/www/android-device-dashboard/.env.production`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application URLs
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_DEVICE_SERVER_URL=https://yourdomain.com:9211
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Server Configuration
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
PUBLIC_IP=yourdomain.com
```

**Security Notes:**
- Never commit `.env.production` to version control
- Use strong, unique values for all keys
- Restrict `ALLOWED_ORIGINS` to your production domain(s) only
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret and secure

### Secure Environment File

```bash
chmod 600 .env.production
```

## Step 4: PM2 Configuration

### Start Applications with PM2

The `ecosystem.config.js` file is already configured. Start the applications:

```bash
# Start both applications
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs

# Save PM2 configuration to auto-start on reboot
pm2 save

# Generate startup script
pm2 startup
# Follow the instructions provided by the command above
```

### PM2 Management Commands

```bash
# View status of all apps
pm2 status

# View logs for specific app
pm2 logs android-dashboard
pm2 logs device-server

# View all logs
pm2 logs

# Monitor resources
pm2 monit

# Restart applications
pm2 restart all
pm2 restart android-dashboard
pm2 restart device-server

# Stop applications
pm2 stop all

# Delete applications from PM2
pm2 delete all
```

### Configure Log Rotation

```bash
# Install PM2 log rotation module
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

## Step 5: Nginx Reverse Proxy Configuration

### Create Nginx Configuration

1. Copy the example configuration:
```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/android-dashboard
```

2. Edit the configuration file:
```bash
sudo nano /etc/nginx/sites-available/android-dashboard
```

3. Replace `yourdomain.com` with your actual domain name in all locations.

### Enable Site

```bash
# Create symlink to enable site
sudo ln -s /etc/nginx/sites-available/android-dashboard /etc/nginx/sites-enabled/

# Remove default Nginx site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test passes, restart Nginx
sudo systemctl restart nginx
```

## Step 6: SSL Certificate Setup

### Obtain SSL Certificate with Let's Encrypt

```bash
# Obtain certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow the interactive prompts:
# - Enter your email address
# - Agree to terms of service
# - Choose whether to redirect HTTP to HTTPS (recommended: Yes)
```

### Verify Auto-Renewal

```bash
# Test certificate renewal
sudo certbot renew --dry-run

# Certbot automatically sets up a cron job for renewal
# Verify it exists:
sudo systemctl status certbot.timer
```

## Step 7: Firewall Configuration

### Configure UFW Firewall

```bash
# Allow SSH (important - do this first!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow device server port (if exposing directly)
# Note: If using reverse proxy, you may not need this
sudo ufw allow 9211/tcp

# Enable firewall
sudo ufw enable

# Check firewall status
sudo ufw status
```

## Step 8: Backup Strategy

### Setup Backup Script

The `backup.sh` script is already created. Make it executable and set up a cron job:

```bash
# Make backup script executable
chmod +x backup.sh

# Test the backup script
./backup.sh

# Set up daily backup at 2 AM
crontab -e

# Add this line:
0 2 * * * /var/www/android-device-dashboard/backup.sh >> /var/log/android-dashboard-backup.log 2>&1
```

### Manual Backup

```bash
# Run backup manually
./backup.sh

# View backup directory
ls -lh /var/backups/android-dashboard/
```

## Step 9: Monitoring and Maintenance

### Application Monitoring

```bash
# PM2 monitoring dashboard
pm2 monit

# View real-time logs
pm2 logs --lines 100

# Check application status
pm2 status
pm2 info android-dashboard
pm2 info device-server
```

### System Monitoring

```bash
# Check system resources
htop
# or
top

# Check disk space
df -h

# Check memory usage
free -h

# Check Nginx status
sudo systemctl status nginx

# Check PM2 processes
pm2 list
```

### Log Locations

- PM2 logs: `./logs/` directory in project root
- Nginx access logs: `/var/log/nginx/access.log`
- Nginx error logs: `/var/log/nginx/error.log`
- Backup logs: `/var/log/android-dashboard-backup.log`

## Step 10: Updates and Maintenance

### Updating the Application

```bash
# Navigate to project directory
cd /var/www/android-device-dashboard

# Pull latest changes
git pull origin main

# Install/update dependencies
npm install --production

# Rebuild Next.js application
npm run build

# Restart applications
pm2 restart all

# Check status
pm2 status
pm2 logs --lines 50
```

### Rolling Back Updates

```bash
# If you need to rollback
cd /var/www/android-device-dashboard

# Check git log for previous commits
git log --oneline

# Reset to previous commit (replace COMMIT_HASH)
git reset --hard COMMIT_HASH

# Rebuild and restart
npm run build
pm2 restart all
```

## Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs android-dashboard --lines 100
pm2 logs device-server --lines 100

# Check if ports are in use
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :9211

# Check environment variables
pm2 env android-dashboard
pm2 env device-server
```

### Nginx Issues

```bash
# Check Nginx configuration
sudo nginx -t

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx

# Check Nginx status
sudo systemctl status nginx
```

### SSL Certificate Issues

```bash
# Check certificate expiration
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Check certificate files
sudo ls -la /etc/letsencrypt/live/yourdomain.com/
```

### Connection Issues

```bash
# Check if applications are running
pm2 status

# Check if ports are listening
sudo ss -tulpn | grep :3000
sudo ss -tulpn | grep :9211

# Test local connection
curl http://localhost:3000
curl http://localhost:9211/api/test
```

### Database Connection Issues

- Verify Supabase credentials in `.env.production`
- Check Supabase project status
- Verify network connectivity to Supabase
- Check Supabase logs in dashboard

## Security Checklist

- [ ] `.env.production` has correct permissions (600)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is kept secret
- [ ] `ALLOWED_ORIGINS` is restricted to production domains
- [ ] Firewall is configured and enabled
- [ ] SSL certificates are installed and auto-renewing
- [ ] Nginx security headers are configured
- [ ] PM2 is configured with proper user permissions
- [ ] Backup script is running daily
- [ ] Log rotation is configured
- [ ] System is regularly updated (`sudo apt update && sudo apt upgrade`)

## Performance Optimization

### Enable Gzip Compression in Nginx

Add to your Nginx config (if not already present):

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
```

### PM2 Cluster Mode (Optional)

For high traffic, you can run multiple instances:

```javascript
// In ecosystem.config.js, change instances:
instances: 'max',  // or a specific number like 2
exec_mode: 'cluster',
```

**Note:** Only works for stateless applications. Socket.IO may need special configuration.

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

## Support

For issues and questions:
1. Check application logs: `pm2 logs`
2. Check Nginx logs: `/var/log/nginx/`
3. Review this documentation
4. Check Supabase dashboard for database issues

---

**Last Updated:** $(date)
**Version:** 1.0

