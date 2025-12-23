# Production Deployment Guide - Ubuntu Server

Complete step-by-step guide to deploy your application to production on Ubuntu Server.

---

## 🚀 Quick Start (Automated - Recommended)

**Fastest way to deploy:**

```bash
# 1. Clone your repository on the server
cd /var/www
sudo git clone <your-repo-url> android-device-dashboard
cd android-device-dashboard

# 2. Run automated deployment script
chmod +x deploy-ubuntu.sh
sudo ./deploy-ubuntu.sh

# 3. Configure environment variables
sudo nano .env.production
# Add your Supabase credentials and other settings

# 4. Restart services
pm2 restart all
```

**That's it!** Your application is now running in production.

---

## 📋 Prerequisites

Before starting, make sure you have:

- ✅ Ubuntu Server 20.04+ (22.04+ recommended)
- ✅ Root or sudo access
- ✅ Domain name with DNS pointing to your server IP (optional but recommended)
- ✅ Supabase project with production credentials
- ✅ Git repository access

---

## 🔧 Detailed Step-by-Step Guide

### Step 1: Connect to Your Ubuntu Server

```bash
# SSH into your server
ssh user@your-server-ip
```

### Step 2: Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 3: Clone Your Repository

```bash
# Create application directory
sudo mkdir -p /var/www
cd /var/www

# Clone your repository
sudo git clone <your-repo-url> android-device-dashboard
cd android-device-dashboard

# Set ownership
sudo chown -R $USER:$USER /var/www/android-device-dashboard
```

### Step 4: Run Automated Deployment Script

```bash
# Make script executable
chmod +x deploy-ubuntu.sh

# Run the script (it will install everything)
sudo ./deploy-ubuntu.sh
```

**What the script does:**
- ✅ Installs Node.js 20 (LTS)
- ✅ Installs PM2 (process manager)
- ✅ Installs Nginx (web server)
- ✅ Installs Certbot (SSL certificates)
- ✅ Sets up firewall
- ✅ Builds your application
- ✅ Starts services with PM2

### Step 5: Configure Environment Variables

```bash
# Edit production environment file
nano .env.production
```

**Add your configuration:**

```env
# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Application URLs (REQUIRED)
NEXT_PUBLIC_APP_URL=https://yourdomain.com
DEVICE_SERVER_URL=http://localhost:9211
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Server Configuration
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# Webhook Security (REQUIRED - 32+ characters)
WEBHOOK_SECRET=your_secure_random_string_at_least_32_characters_long

# Optional: Device Server Public URL (if exposing directly)
NEXT_PUBLIC_DEVICE_SERVER_URL=https://yourdomain.com:9211
```

**Secure the file:**
```bash
chmod 600 .env.production
```

### Step 6: Restart Application

```bash
# Restart PM2 processes
pm2 restart all

# Check status
pm2 status
pm2 logs
```

### Step 7: Configure Nginx

```bash
# Copy example configuration
sudo cp nginx.conf.example /etc/nginx/sites-available/android-dashboard

# Edit configuration
sudo nano /etc/nginx/sites-available/android-dashboard
# Replace 'yourdomain.com' with your actual domain

# Enable site
sudo ln -s /etc/nginx/sites-available/android-dashboard /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Step 8: Setup SSL Certificate (HTTPS)

```bash
# Install Certbot (if not already installed)
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

**Note:** Certbot will automatically configure Nginx with SSL.

### Step 9: Verify Everything is Working

```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs android-dashboard
pm2 logs device-server

# Check Nginx status
sudo systemctl status nginx

# Test your domain
curl https://yourdomain.com
```

---

## 🔍 Post-Deployment Checklist

- [ ] Application is accessible at `https://yourdomain.com`
- [ ] SSL certificate is installed and working
- [ ] PM2 processes are running (`pm2 status`)
- [ ] Nginx is running (`sudo systemctl status nginx`)
- [ ] Firewall is configured (`sudo ufw status`)
- [ ] Environment variables are set correctly
- [ ] Supabase connection is working
- [ ] Device server is accessible (if needed)
- [ ] Logs are being generated (`pm2 logs`)

---

## 🎮 Daily Operations

### View Application Status
```bash
pm2 status
pm2 logs
pm2 logs android-dashboard --lines 50
pm2 logs device-server --lines 50
```

### Restart Application
```bash
pm2 restart all
# or
pm2 restart android-dashboard
pm2 restart device-server
```

### Stop Application
```bash
pm2 stop all
```

### Update Application
```bash
cd /var/www/android-device-dashboard

# Pull latest changes
git pull origin main

# Install/update dependencies
npm install --production

# Rebuild application
npm run build

# Restart
pm2 restart all

# Check status
pm2 status
```

---

## 🔒 Security Checklist

- [ ] `.env.production` has correct permissions (600)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is kept secret
- [ ] `ALLOWED_ORIGINS` is restricted to production domains
- [ ] `WEBHOOK_SECRET` is set (32+ characters)
- [ ] Firewall is configured and enabled
- [ ] SSL certificates are installed and auto-renewing
- [ ] Nginx security headers are configured
- [ ] PM2 is configured with proper user permissions
- [ ] Log rotation is configured
- [ ] System is regularly updated

---

## 🛠️ Troubleshooting

### Application Won't Start
```bash
# Check PM2 logs
pm2 logs --lines 100

# Check if ports are in use
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :9211

# Check environment variables
pm2 env android-dashboard
```

### Port Already in Use
```bash
# Find process using port
sudo lsof -i :3000
sudo lsof -i :9211

# Kill process (replace PID)
sudo kill -9 <PID>
```

### Nginx Issues
```bash
# Check Nginx configuration
sudo nginx -t

# View error logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx
```

### SSL Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Check auto-renewal
sudo certbot renew --dry-run
```

---

## 📦 Backup

### Manual Backup
```bash
# Create backup directory
sudo mkdir -p /var/backups/android-dashboard

# Backup application
sudo tar -czf /var/backups/android-dashboard/app-$(date +%Y%m%d).tar.gz \
  /var/www/android-device-dashboard \
  --exclude=node_modules \
  --exclude=.next

# Backup environment file
sudo cp /var/www/android-device-dashboard/.env.production \
  /var/backups/android-dashboard/.env.production-$(date +%Y%m%d)
```

### Automated Backup (Cron)
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * tar -czf /var/backups/android-dashboard/app-$(date +\%Y\%m\%d).tar.gz /var/www/android-device-dashboard --exclude=node_modules --exclude=.next
```

---

## 🔄 Updating Your Application

```bash
cd /var/www/android-device-dashboard

# 1. Pull latest changes
git pull origin main

# 2. Install/update dependencies
npm install --production

# 3. Rebuild application
npm run build

# 4. Restart services
pm2 restart all

# 5. Check status
pm2 status
pm2 logs --lines 50
```

---

## 📊 Monitoring

### PM2 Monitoring
```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs --lines 100

# Check process info
pm2 info android-dashboard
pm2 info device-server
```

### System Monitoring
```bash
# Check system resources
htop

# Check disk space
df -h

# Check memory
free -h

# Check Nginx status
sudo systemctl status nginx
```

---

## 🌐 Domain Configuration

### DNS Settings

Point your domain to your server:

```
Type: A
Name: @
Value: your-server-ip
TTL: 3600

Type: A
Name: www
Value: your-server-ip
TTL: 3600
```

### Verify DNS
```bash
# Check if DNS is pointing correctly
nslookup yourdomain.com
dig yourdomain.com
```

---

## ✅ Production Checklist

Before going live, verify:

- [ ] All environment variables are set
- [ ] Supabase is configured correctly
- [ ] SSL certificate is installed
- [ ] Firewall is configured
- [ ] PM2 is running both services
- [ ] Nginx is configured and running
- [ ] Application is accessible via HTTPS
- [ ] Logs are being generated
- [ ] Backup strategy is in place
- [ ] Monitoring is set up

---

## 📚 Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

---

## 🆘 Need Help?

If you encounter issues:

1. Check PM2 logs: `pm2 logs`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify environment variables: `pm2 env android-dashboard`
4. Check firewall: `sudo ufw status`
5. Test connectivity: `curl http://localhost:3000`

---

**Last Updated**: $(date)

