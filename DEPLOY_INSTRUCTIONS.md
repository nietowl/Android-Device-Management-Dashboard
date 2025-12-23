# Quick Deployment Instructions
## Server IP: 45.80.158.111

### Step 1: Connect to Server

```bash
ssh root@45.80.158.111
# or
ssh your-user@45.80.158.111
```

### Step 2: Clone Repository

```bash
cd /var/www
git clone <your-repo-url> android-device-dashboard
cd android-device-dashboard
```

### Step 3: Run Deployment Script

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

**Or if you have a domain:**
```bash
sudo ./deploy.sh yourdomain.com
```

### Step 4: Configure Environment Variables

```bash
nano .env.production
```

**Required variables:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://45.80.158.111
ALLOWED_ORIGINS=http://45.80.158.111
```

### Step 5: Restart Application

```bash
pm2 restart all
pm2 status
```

### Step 6: Access Application

Open in browser: **http://45.80.158.111**

---

## Manual Nginx Setup (if needed)

```bash
# Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/android-dashboard

# Enable site
sudo ln -s /etc/nginx/sites-available/android-dashboard /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test and restart
sudo nginx -t
sudo systemctl restart nginx
```

---

## SSL Certificate Setup (Optional - for domain)

If you have a domain pointing to 45.80.158.111:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Then update `.env.production`:
```env
NEXT_PUBLIC_APP_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

## Useful Commands

```bash
# View logs
pm2 logs
pm2 logs android-dashboard --lines 50

# Restart
pm2 restart all

# Status
pm2 status

# Nginx
sudo systemctl status nginx
sudo nginx -t
sudo systemctl restart nginx

# Firewall
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## Troubleshooting

### Application not starting?
```bash
pm2 logs --lines 100
pm2 env android-dashboard
```

### Port already in use?
```bash
sudo lsof -i :3000
sudo lsof -i :9211
```

### Nginx issues?
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

---

**Server IP:** 45.80.158.111  
**Access URL:** http://45.80.158.111

