# Secure Production Deployment Guide

**Complete step-by-step guide for securely deploying the Android Device Management Dashboard to production.**

> **🚀 Quick Start:** For automated deployment, use `deploy-production.sh` script:
> ```bash
> sudo bash deploy-production.sh
> ```
> The script will guide you through the setup and configure everything automatically.

This guide implements security best practices to ensure:
- Internal ports (3000, 9211) are blocked from external access
- All services bind to localhost only
- All traffic routes through nginx reverse proxy on port 443
- SSL/TLS encryption for all connections
- Proper firewall configuration

## Architecture Overview

The application consists of two Node.js processes that run behind a secure nginx reverse proxy:

1. **Next.js Application Server** (`server.js`) - Port 3000 (localhost only)
2. **Device Server** (`device-server.js`) - Port 9211 (localhost only)
3. **Nginx Reverse Proxy** - Port 443 (HTTPS) - Public entry point

### Security Architecture

```
┌─────────────────────────────────────────────────┐
│           INTERNET / EXTERNAL USERS            │
└─────────────────────────────────────────────────┘
                    │
                    │ Only ports 80/443 allowed
                    ▼
        ┌───────────────────────┐
        │   Firewall (UFW)       │
        │   Blocks: 3000, 9211   │
        └───────────────────────┘
                    │
                    │ Ports 80/443 only
                    ▼
        ┌───────────────────────┐
        │   Nginx (Reverse      │
        │   Proxy)              │
        │   Port: 443 (HTTPS)    │
        └───────────────────────┘
            │              │
            │              │ localhost only (127.0.0.1)
    Port 3000          Port 9211
            │              │
            ▼              ▼
    ┌─────────────┐  ┌──────────────┐
    │  Next.js    │  │  Device     │
    │  (127.0.0.1)│  │  Server     │
    │             │  │  (127.0.0.1)│
    └─────────────┘  └──────────────┘
```

## Prerequisites

- Ubuntu 20.04+ or similar Linux distribution
- Root or sudo access
- Domain name with DNS configured (A record pointing to your server IP)
- Supabase project with production credentials
- Basic knowledge of Linux command line

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

# Install firewall (if not already installed)
sudo apt install -y ufw
```

## Step 2: Application Deployment

### Clone and Setup

```bash
# Navigate to deployment directory
cd /var/www

# Clone your repository (dev branch)
sudo git clone -b dev https://github.com/nietowl/Android-Device-Management-Dashboard.git android-device-dashboard
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

# Application URLs - CRITICAL: Use same domain for both
# Device server routes through main domain, NOT separate port
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_DEVICE_SERVER_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Server Configuration
NODE_ENV=production
PORT=3000
# SECURITY: Do NOT set HOSTNAME=0.0.0.0
# Services will automatically bind to 127.0.0.1 in production
# HOSTNAME=127.0.0.1  # Optional: explicitly set for clarity

# Internal URLs (server-side only, not exposed)
DEVICE_SERVER_URL=http://127.0.0.1:9211
```

**Critical Security Notes:**
- ✅ `NEXT_PUBLIC_DEVICE_SERVER_URL` should be `https://yourdomain.com` (same as app URL)
- ✅ `ALLOWED_ORIGINS` must only include your production domains
- ✅ Never commit `.env.production` to version control
- ✅ `SUPABASE_SERVICE_ROLE_KEY` is secret - keep it secure
- ❌ Do NOT set `HOSTNAME=0.0.0.0` - services bind to localhost automatically

### Secure Environment File

```bash
chmod 600 .env.production
```

## Step 4: Firewall Configuration (CRITICAL SECURITY STEP)

### Configure UFW Firewall

**This is the most important security step. It prevents direct external access to internal ports.**

```bash
# IMPORTANT: Allow SSH first (before enabling firewall)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS (public access)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# CRITICAL: Explicitly DENY direct access to internal ports
sudo ufw deny 3000/tcp
sudo ufw deny 9211/tcp

# Enable firewall
sudo ufw enable

# Verify firewall status
sudo ufw status verbose
```

**Expected output:**
```
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
3000/tcp                   DENY IN     Anywhere
9211/tcp                   DENY IN     Anywhere
```

### Verify Firewall is Working

```bash
# Test that internal ports are blocked (from external machine)
# These should FAIL or timeout:
curl https://yourdomain.com:3000
curl https://yourdomain.com:9211

# These should WORK:
curl https://yourdomain.com
```

## Step 5: PM2 Configuration

### Start Applications with PM2

The `ecosystem.config.js` file is already configured. Start the applications:

```bash
# Navigate to project directory
cd /var/www/android-device-dashboard

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

### Verify Services are Bound to Localhost

```bash
# Check that services are listening on 127.0.0.1 only
sudo ss -tulpn | grep :3000
# Should show: 127.0.0.1:3000 (NOT 0.0.0.0:3000)

sudo ss -tulpn | grep :9211
# Should show: 127.0.0.1:9211 (NOT 0.0.0.0:9211)
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

## Step 6: Nginx Reverse Proxy Configuration

### Create Secure Nginx Configuration

1. Copy the secure configuration:
```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/android-dashboard
```

2. Edit the configuration file:
```bash
sudo nano /etc/nginx/sites-available/android-dashboard
```

3. Replace `yourdomain.com` with your actual domain name in all locations.

**Key Security Features in Configuration:**
- ✅ All traffic routes through port 443 (HTTPS)
- ✅ Device server routes through main domain (`/socket.io`, `/devices`, etc.)
- ✅ Uses `127.0.0.1` in proxy_pass (not `localhost`)
- ✅ Security headers configured
- ✅ No separate port 9211 block (prevents direct access)

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

# Check Nginx status
sudo systemctl status nginx
```

## Step 7: SSL Certificate Setup

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

## Step 8: Security Verification

### Test 1: Verify Internal Ports are Blocked

```bash
# From an external machine (or use curl from another server)
# These should FAIL or timeout:
curl -v https://yourdomain.com:3000
curl -v https://yourdomain.com:9211

# Expected: Connection refused or timeout
```

### Test 2: Verify Proxy Routing Works

```bash
# These should WORK:
curl https://yourdomain.com
curl https://yourdomain.com/socket.io
curl https://yourdomain.com/devices
curl https://yourdomain.com/api/health
```

### Test 3: Verify Services are Bound to Localhost

```bash
# Check listening ports
sudo ss -tulpn | grep -E ':(3000|9211)'

# Should show:
# tcp LISTEN 0 511 127.0.0.1:3000
# tcp LISTEN 0 511 127.0.0.1:9211

# NOT:
# tcp LISTEN 0 511 0.0.0.0:3000  ❌
# tcp LISTEN 0 511 0.0.0.0:9211  ❌
```

### Test 4: Verify Firewall Rules

```bash
# Check firewall status
sudo ufw status verbose

# Should show ports 3000 and 9211 as DENY
```

### Test 5: Verify SSL Certificate

```bash
# Check certificate expiration
sudo certbot certificates

# Test SSL configuration
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com
```

## Step 9: Backup Strategy

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

## Step 10: Monitoring and Maintenance

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

## Step 11: Updates and Maintenance

### Updating the Application

```bash
# Navigate to project directory
cd /var/www/android-device-dashboard

# Pull latest changes from dev branch
git pull origin dev

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
sudo ss -tulpn | grep :3000
sudo ss -tulpn | grep :9211

# Check environment variables
pm2 env android-dashboard
pm2 env device-server

# Verify services are bound to localhost
sudo ss -tulpn | grep -E ':(3000|9211)'
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
curl http://127.0.0.1:3000
curl http://127.0.0.1:9211/api/health

# Test through proxy
curl https://yourdomain.com
curl https://yourdomain.com/api/health
```

### Socket.IO Connection Issues

```bash
# Verify device-server is accessible through proxy
curl https://yourdomain.com/socket.io

# Check CORS configuration in device-server logs
pm2 logs device-server | grep CORS

# Verify ALLOWED_ORIGINS includes your domain
# Check .env.production file
```

### Database Connection Issues

- Verify Supabase credentials in `.env.production`
- Check Supabase project status
- Verify network connectivity to Supabase
- Check Supabase logs in dashboard

## Security Checklist

Use this checklist to verify your deployment is secure:

### Firewall Configuration
- [ ] SSH port (22) is allowed
- [ ] HTTP port (80) is allowed
- [ ] HTTPS port (443) is allowed
- [ ] Port 3000 is DENIED (blocked)
- [ ] Port 9211 is DENIED (blocked)
- [ ] Firewall is enabled and active

### Service Binding
- [ ] Next.js app binds to `127.0.0.1:3000` (not `0.0.0.0`)
- [ ] Device server binds to `127.0.0.1:9211` (not `0.0.0.0`)
- [ ] Services are NOT accessible from external IPs directly

### Nginx Configuration
- [ ] All traffic routes through port 443 (HTTPS)
- [ ] Device server routes through main domain (not separate port)
- [ ] Uses `127.0.0.1` in proxy_pass directives
- [ ] Security headers are configured
- [ ] SSL certificates are installed and valid

### Environment Variables
- [ ] `.env.production` has correct permissions (600)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is kept secret
- [ ] `ALLOWED_ORIGINS` is restricted to production domains only
- [ ] `NEXT_PUBLIC_DEVICE_SERVER_URL` uses main domain (not port 9211)
- [ ] `HOSTNAME` is NOT set to `0.0.0.0`

### SSL/TLS
- [ ] SSL certificates are installed
- [ ] HTTP redirects to HTTPS
- [ ] Certificate auto-renewal is configured
- [ ] SSL protocols are secure (TLS 1.2+)

### Monitoring
- [ ] PM2 is configured with proper user permissions
- [ ] Backup script is running daily
- [ ] Log rotation is configured
- [ ] System is regularly updated

## Performance Optimization

### Enable Gzip Compression in Nginx

Add to your Nginx config (if not already present in main nginx.conf):

```nginx
# In /etc/nginx/nginx.conf, add to http block:
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
```

### Rate Limiting (Optional but Recommended)

Add to `/etc/nginx/nginx.conf` in the `http` block:

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=general_limit:10m rate=30r/s;
```

Then uncomment the `limit_req` directives in your site configuration.

## Common Security Issues and Fixes

### Issue: Direct Port Access Still Works

**Symptom:** Can access `https://yourdomain.com:3000` from external

**Fix:**
```bash
# Verify firewall is blocking
sudo ufw deny 3000/tcp
sudo ufw deny 9211/tcp
sudo ufw reload

# Verify services bind to localhost
# Check PM2 logs or use: sudo ss -tulpn | grep :3000
```

### Issue: Services Binding to 0.0.0.0

**Symptom:** `sudo ss -tulpn` shows `0.0.0.0:3000` instead of `127.0.0.1:3000`

**Fix:**
```bash
# Check .env.production - ensure HOSTNAME is NOT set to 0.0.0.0
# Remove or comment out: HOSTNAME=0.0.0.0
# Restart services
pm2 restart all
```

### Issue: Socket.IO Connection Fails

**Symptom:** Browser console shows Socket.IO connection errors

**Fix:**
1. Verify `NEXT_PUBLIC_DEVICE_SERVER_URL=https://yourdomain.com` (not port 9211)
2. Check `ALLOWED_ORIGINS` includes your domain
3. Verify nginx routes `/socket.io` to device-server
4. Check device-server logs: `pm2 logs device-server`

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [UFW Firewall Guide](https://help.ubuntu.com/community/UFW)

## Support

For issues and questions:
1. Check application logs: `pm2 logs`
2. Check Nginx logs: `/var/log/nginx/`
3. Review this documentation
4. Check Supabase dashboard for database issues
5. Verify security checklist items

---

**Last Updated:** 2024
**Version:** 2.0 (Secure Deployment)
**Security Level:** Production-Ready

