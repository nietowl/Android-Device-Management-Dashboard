#!/bin/bash
# Quick Deployment Script for Android Device Management Dashboard
# Server IP: 45.80.158.111

set -e

SERVER_IP="45.80.158.111"
APP_DIR="/var/www/android-device-dashboard"
DOMAIN="${1:-$SERVER_IP}"  # Use domain if provided, otherwise use IP

echo "========================================"
echo "  Android Dashboard - Quick Deployment"
echo "  Server: $SERVER_IP"
echo "========================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Please run with sudo: sudo ./deploy.sh [domain.com]"
    exit 1
fi

# Step 1: Update system
echo "[1/7] Updating system..."
apt update && apt upgrade -y

# Step 2: Install Node.js 20
echo "[2/7] Installing Node.js 20..."
if ! command -v node &> /dev/null || [ "$(node --version | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "  ✅ Node.js: $(node --version)"

# Step 3: Install PM2
echo "[3/7] Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 7
fi

# Step 4: Install Nginx
echo "[4/7] Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
fi

# Step 5: Setup application
echo "[5/7] Setting up application..."
if [ ! -d "$APP_DIR" ]; then
    echo "  ⚠️  Application directory not found!"
    echo "  Please clone your repository first:"
    echo "  cd /var/www && git clone <your-repo-url> android-device-dashboard"
    exit 1
fi

cd "$APP_DIR"

# Install dependencies
echo "  Installing dependencies..."
npm install --production

# Build application
echo "  Building application..."
npm run build

# Create logs directory
mkdir -p logs

# Step 6: Configure environment
echo "[6/7] Configuring environment..."
if [ ! -f ".env.production" ]; then
    echo "  Creating .env.production template..."
    cat > .env.production << EOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Application URLs
NEXT_PUBLIC_APP_URL=http://${DOMAIN}
DEVICE_SERVER_URL=http://localhost:9211
ALLOWED_ORIGINS=http://${DOMAIN},https://${DOMAIN}

# Server Configuration
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# Webhook Security (Required - 32+ characters)
WEBHOOK_SECRET=$(openssl rand -hex 32)
EOF
    chmod 600 .env.production
    echo "  ✅ Created .env.production"
    echo ""
    echo "  ⚠️  IMPORTANT: Edit .env.production and add your Supabase credentials!"
    echo "  nano .env.production"
else
    echo "  ✅ .env.production exists"
    chmod 600 .env.production
fi

# Step 7: Configure firewall
echo "[7/7] Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp   # SSH
    ufw allow 80/tcp   # HTTP
    ufw allow 443/tcp  # HTTPS
    ufw allow 9211/tcp # Device Server
    ufw --force enable
    echo "  ✅ Firewall configured"
fi

# Configure Nginx
echo ""
echo "Configuring Nginx..."
if [ "$DOMAIN" != "$SERVER_IP" ]; then
    # Domain provided - use domain-based config
    NGINX_CONFIG="/etc/nginx/sites-available/android-dashboard"
    cp nginx.conf.example "$NGINX_CONFIG"
    sed -i "s/yourdomain.com/$DOMAIN/g" "$NGINX_CONFIG"
    sed -i "s/www.yourdomain.com/www.$DOMAIN/g" "$NGINX_CONFIG"
    
    # Enable site
    ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/android-dashboard
    rm -f /etc/nginx/sites-enabled/default
    
    echo "  ✅ Nginx configured for domain: $DOMAIN"
    echo "  Run: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
else
    # IP only - create simple HTTP config
    cat > /etc/nginx/sites-available/android-dashboard << EOF
server {
    listen 80;
    server_name ${SERVER_IP};

    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    location /api/socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
EOF
    ln -sf /etc/nginx/sites-available/android-dashboard /etc/nginx/sites-enabled/android-dashboard
    rm -f /etc/nginx/sites-enabled/default
    echo "  ✅ Nginx configured for IP: $SERVER_IP"
fi

# Test and restart Nginx
nginx -t && systemctl restart nginx

# Start application with PM2
echo ""
echo "Starting application with PM2..."
cd "$APP_DIR"
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# Setup PM2 startup
echo ""
echo "Setting up PM2 startup..."
STARTUP_CMD=$(pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER 2>/dev/null | grep "sudo" || echo "")
if [ ! -z "$STARTUP_CMD" ]; then
    echo "  Run this command to enable PM2 on boot:"
    echo "  $STARTUP_CMD"
fi

echo ""
echo "========================================"
echo "  ✅ Deployment Complete!"
echo "========================================"
echo ""
echo "Server IP: $SERVER_IP"
echo "Access URL: http://${DOMAIN}"
echo ""
echo "Application Status:"
pm2 status
echo ""
echo "Next steps:"
if [ "$DOMAIN" != "$SERVER_IP" ]; then
    echo "  1. Setup SSL: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    echo "  2. Update .env.production: NEXT_PUBLIC_APP_URL=https://$DOMAIN"
else
    echo "  1. Edit .env.production and add your Supabase credentials"
    echo "  2. For HTTPS, setup a domain and run: sudo certbot --nginx -d yourdomain.com"
fi
echo "  3. Restart: pm2 restart all"
echo ""
echo "Useful commands:"
echo "  pm2 logs              - View logs"
echo "  pm2 status            - Check status"
echo "  pm2 restart all       - Restart application"
echo "  sudo nginx -t         - Test Nginx config"
echo "  sudo systemctl status nginx - Check Nginx"
echo ""

