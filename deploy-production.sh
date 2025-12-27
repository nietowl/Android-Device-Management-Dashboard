#!/bin/bash

# ============================================
# Automated Production Deployment Script
# Android Device Management Dashboard
# ============================================
# This script automates the complete production setup
# Run with: sudo bash deploy-production.sh
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration variables (will be prompted)
SERVER_IP="45.138.16.238"
DOMAIN=""
USE_SSL=false
USE_SELF_SIGNED_SSL=false
SUPABASE_URL="https://sqrmwanjudctgtgssjcg.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxcm13YW5qdWRjdGd0Z3NzamNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1Njk4MTMsImV4cCI6MjA3ODE0NTgxM30.vwCLd0uqU7j3nwZxRwEv0AhblmvMb86phSLhJpxSVKY"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxcm13YW5qdWRjdGd0Z3NzamNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjU2OTgxMywiZXhwIjoyMDc4MTQ1ODEzfQ._N6mUm4VWSv9nhagRZsBRN43sNaO1vSMHa75RmcxZ-I"
DEPLOY_USER=$(whoami)
DEPLOY_DIR="/var/www/android-device-dashboard"
REPO_URL="https://github.com/nietowl/Android-Device-Management-Dashboard.git"
BRANCH="dev"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Production Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# ============================================
# Step 1: Collect Configuration
# ============================================
echo -e "${YELLOW}Configuration${NC}"
echo ""

read -p "Server IP address [$SERVER_IP]: " INPUT_IP
if [ ! -z "$INPUT_IP" ]; then
    SERVER_IP=$INPUT_IP
fi

read -p "Domain name (optional, press Enter to use IP only): " DOMAIN
if [ -z "$DOMAIN" ]; then
    DOMAIN=$SERVER_IP
    USE_SSL=false
    USE_SELF_SIGNED_SSL=false
    echo -e "${YELLOW}Using IP address: $SERVER_IP${NC}"
    echo ""
    echo -e "${YELLOW}SSL Certificate Options:${NC}"
    echo "1. Use self-signed certificate (browsers will show warnings)"
    echo "2. Use HTTP only (no SSL)"
    echo ""
    read -p "Generate self-signed SSL certificate? (y/n) [n]: " USE_SELF_SIGNED
    if [ "$USE_SELF_SIGNED" = "y" ] || [ "$USE_SELF_SIGNED" = "Y" ]; then
        USE_SELF_SIGNED_SSL=true
        USE_SSL=true
        echo -e "${YELLOW}Self-signed SSL will be configured${NC}"
        echo -e "${YELLOW}⚠️  Note: Browsers will show 'Not Secure' warnings${NC}"
        echo -e "${YELLOW}   Users must manually accept the certificate${NC}"
    else
        USE_SELF_SIGNED_SSL=false
        USE_SSL=false
        echo -e "${YELLOW}Using HTTP only (no SSL)${NC}"
    fi
else
    USE_SSL=true
    USE_SELF_SIGNED_SSL=false
    read -p "WWW domain (e.g., www.$DOMAIN) [optional, press Enter to skip]: " WWW_DOMAIN
    if [ -z "$WWW_DOMAIN" ]; then
        WWW_DOMAIN="www.$DOMAIN"
    fi
fi

read -p "Supabase URL [$SUPABASE_URL]: " INPUT_SUPABASE_URL
if [ ! -z "$INPUT_SUPABASE_URL" ]; then
    SUPABASE_URL=$INPUT_SUPABASE_URL
fi
if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}Supabase URL is required!${NC}"
    exit 1
fi

read -p "Supabase Anon Key [$SUPABASE_ANON_KEY]: " INPUT_SUPABASE_ANON_KEY
if [ ! -z "$INPUT_SUPABASE_ANON_KEY" ]; then
    SUPABASE_ANON_KEY=$INPUT_SUPABASE_ANON_KEY
fi
if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}Supabase Anon Key is required!${NC}"
    exit 1
fi

read -p "Supabase Service Role Key [$SUPABASE_SERVICE_KEY]: " INPUT_SUPABASE_SERVICE_KEY
if [ ! -z "$INPUT_SUPABASE_SERVICE_KEY" ]; then
    SUPABASE_SERVICE_KEY=$INPUT_SUPABASE_SERVICE_KEY
fi
if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo -e "${RED}Supabase Service Role Key is required!${NC}"
    exit 1
fi

# Generate a secure random webhook secret if not provided
WEBHOOK_SECRET=""
read -p "Webhook Secret (press Enter to generate a secure random secret): " INPUT_WEBHOOK_SECRET
if [ ! -z "$INPUT_WEBHOOK_SECRET" ]; then
    WEBHOOK_SECRET=$INPUT_WEBHOOK_SECRET
else
    # Generate a secure 32-character random secret
    if command -v openssl &> /dev/null; then
        WEBHOOK_SECRET=$(openssl rand -hex 32)
    elif command -v /dev/urandom &> /dev/null; then
        WEBHOOK_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '\n' | cut -c1-32)
    else
        # Fallback: use date + random number
        WEBHOOK_SECRET=$(date +%s | sha256sum | base64 | head -c 32)
    fi
    echo -e "${GREEN}Generated webhook secret: ${WEBHOOK_SECRET}${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANT: Save this webhook secret! You'll need it to send webhook requests.${NC}"
fi
if [ -z "$WEBHOOK_SECRET" ]; then
    echo -e "${RED}Webhook Secret is required!${NC}"
    exit 1
fi

read -p "Deployment user [$DEPLOY_USER]: " INPUT_USER
if [ ! -z "$INPUT_USER" ]; then
    DEPLOY_USER=$INPUT_USER
fi

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  Server: $SERVER_IP"
echo "  Domain: $DOMAIN"
if [ "$USE_SSL" = true ]; then
    if [ "$USE_SELF_SIGNED_SSL" = true ]; then
        echo "  SSL: Self-Signed"
    else
        echo "  SSL: Let's Encrypt"
    fi
else
    echo "  SSL: Disabled"
fi
echo ""
read -p "Continue? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    exit 0
fi

# ============================================
# Step 2: Install System Dependencies
# ============================================
echo ""
echo -e "${YELLOW}Installing dependencies...${NC}"
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw

# Install Node.js 20+
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# ============================================
# Step 3: Clone and Setup Application
# ============================================
echo ""
echo -e "${YELLOW}Setting up application...${NC}"

# Create deployment directory
mkdir -p /var/www
cd /var/www

# Remove existing if present
if [ -d "android-device-dashboard" ]; then
    rm -rf android-device-dashboard
fi

# Clone repository
git clone -b $BRANCH $REPO_URL android-device-dashboard
cd android-device-dashboard

# Set ownership
chown -R $DEPLOY_USER:$DEPLOY_USER /var/www/android-device-dashboard

# Determine protocol based on SSL
if [ "$USE_SSL" = true ]; then
    PROTOCOL="https"
    if [ "$USE_SELF_SIGNED_SSL" = true ]; then
        APP_URL="$PROTOCOL://$SERVER_IP"
        ALLOWED_ORIGINS="$PROTOCOL://$SERVER_IP"
    else
        APP_URL="$PROTOCOL://$DOMAIN"
        ALLOWED_ORIGINS="$PROTOCOL://$DOMAIN,$PROTOCOL://$WWW_DOMAIN"
    fi
else
    PROTOCOL="http"
    APP_URL="$PROTOCOL://$SERVER_IP"
    ALLOWED_ORIGINS="$PROTOCOL://$SERVER_IP"
fi

cat > .env.production << EOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY

# Application URLs
NEXT_PUBLIC_SITE_URL=$APP_URL
NEXT_PUBLIC_APP_URL=$APP_URL
NEXT_PUBLIC_DEVICE_SERVER_URL=$APP_URL
ALLOWED_ORIGINS=$ALLOWED_ORIGINS

# Server Configuration
NODE_ENV=production
PORT=3000
DEVICE_SERVER_URL=http://127.0.0.1:9211

# Security Configuration
# SECURITY: Webhook secret is REQUIRED in production for webhook authentication
WEBHOOK_SECRET=$WEBHOOK_SECRET
ALLOW_HTTP_IN_PRODUCTION=true  # Only for testing - remove in real production
EOF

# Secure environment file
chmod 600 .env.production
chown $DEPLOY_USER:$DEPLOY_USER .env.production

# Validate environment variables
if echo "$APP_URL" | grep -q ":8080"; then
    echo -e "${RED}⚠️  WARNING: Port 8080 detected in APP_URL!${NC}"
    echo -e "${RED}   Production should use port 80 (HTTP) or 443 (HTTPS).${NC}"
    read -p "Continue anyway? (y/n): " CONTINUE_WITH_8080
    if [ "$CONTINUE_WITH_8080" != "y" ]; then
        exit 1
    fi
fi

# Remove development files before building (security: prevent dev files in production)
echo -e "${YELLOW}Removing development files...${NC}"
cd $DEPLOY_DIR
# Save nginx.conf.example before removing (needed for Nginx configuration)
if [ -f "nginx.conf.example" ]; then
    sudo -u $DEPLOY_USER cp nginx.conf.example /tmp/nginx.conf.example.backup
fi
sudo -u $DEPLOY_USER rm -f dev-proxy.js
sudo -u $DEPLOY_USER rm -f troubleshoot-deployment.sh
sudo -u $DEPLOY_USER rm -f backup.sh
sudo -u $DEPLOY_USER rm -f nginx.conf.example
sudo -u $DEPLOY_USER rm -rf __tests__
sudo -u $DEPLOY_USER rm -f jest.config.js
sudo -u $DEPLOY_USER rm -f jest.setup.js
sudo -u $DEPLOY_USER rm -f CACHE_CLEARING_INSTRUCTIONS.md
sudo -u $DEPLOY_USER rm -f LOCALTONET_SETUP.md
sudo -u $DEPLOY_USER rm -f SECURITY_VULNERABILITIES.md
sudo -u $DEPLOY_USER rm -rf scripts/
echo -e "${GREEN}✅ Development files removed${NC}"

# Install dependencies and build
sudo -u $DEPLOY_USER npm install --legacy-peer-deps
sudo -u $DEPLOY_USER npm run build
sudo -u $DEPLOY_USER npm prune --production

# Create logs directory
mkdir -p logs
chown -R $DEPLOY_USER:$DEPLOY_USER logs

# ============================================
# Step 4: Verify Environment File
# ============================================
if [ ! -f ".env.production" ]; then
    echo -e "${RED}ERROR: Environment file not found!${NC}"
    exit 1
fi

# ============================================
# Step 5: Configure Firewall
# ============================================
echo ""
echo -e "${YELLOW}Configuring firewall...${NC}"

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 3000/tcp
ufw deny 9211/tcp
ufw --force enable

# ============================================
# Step 6: Configure Nginx
# ============================================
echo ""
echo -e "${YELLOW}Configuring Nginx...${NC}"

# Copy and customize nginx config
# Use backup copy if original was removed, otherwise use original
if [ -f "nginx.conf.example" ]; then
    cp nginx.conf.example /etc/nginx/sites-available/android-dashboard
elif [ -f "/tmp/nginx.conf.example.backup" ]; then
    cp /tmp/nginx.conf.example.backup /etc/nginx/sites-available/android-dashboard
    rm -f /tmp/nginx.conf.example.backup
else
    echo -e "${RED}ERROR: nginx.conf.example not found!${NC}"
    echo -e "${YELLOW}Please ensure nginx.conf.example exists in the repository.${NC}"
    exit 1
fi
sed -i "s/yourdomain.com/$DOMAIN/g" /etc/nginx/sites-available/android-dashboard
sed -i "s/www.yourdomain.com/$WWW_DOMAIN/g" /etc/nginx/sites-available/android-dashboard

# If using IP address with self-signed SSL, create SSL config
if [ "$USE_SELF_SIGNED_SSL" = true ]; then
    CERT_FILE="/etc/ssl/certs/ip-ssl-$SERVER_IP.crt"
    KEY_FILE="/etc/ssl/private/ip-ssl-$SERVER_IP.key"
    
    # Generate self-signed certificate if it doesn't exist
    if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
        bash /var/www/android-device-dashboard/scripts/generate-self-signed-cert.sh $SERVER_IP
    fi
    
    cat > /etc/nginx/sites-available/android-dashboard << NGINX_EOF
# HTTPS Configuration for IP Address (Self-Signed Certificate)
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name $SERVER_IP;
    return 301 https://\$server_name\$request_uri;
}

# Main application server with SSL
server {
    listen 443 ssl http2;
    server_name $SERVER_IP;

    # SSL Configuration (Self-Signed Certificate)
    ssl_certificate $CERT_FILE;
    ssl_certificate_key $KEY_FILE;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Increase body size limit for file uploads
    client_max_body_size 100M;

    # Device Server Socket.IO
    location /socket.io {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # Device Server REST API
    location /devices {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/health {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/command {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/socket-status {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Next.js Application
    location / {
        proxy_pass http://127.0.0.1:3000;
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
}
NGINX_EOF
elif [ "$USE_SSL" = false ]; then
    cat > /etc/nginx/sites-available/android-dashboard << NGINX_EOF
# HTTP Configuration for IP Address
server {
    listen 80;
    server_name $SERVER_IP;

    # Increase body size limit for file uploads
    client_max_body_size 100M;

    # Device Server Socket.IO
    location /socket.io {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # Device Server REST API
    location /devices {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/health {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/command {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/socket-status {
        proxy_pass http://127.0.0.1:9211;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Next.js Application
    location / {
        proxy_pass http://127.0.0.1:3000;
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
}
NGINX_EOF
fi

# Enable site
ln -sf /etc/nginx/sites-available/android-dashboard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and start nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

# ============================================
# Step 7: Setup PM2
# ============================================
echo ""
echo -e "${YELLOW}Setting up PM2...${NC}"

cd /var/www/android-device-dashboard
sudo -u $DEPLOY_USER pm2 start ecosystem.config.js
sudo -u $DEPLOY_USER pm2 save
sudo -u $DEPLOY_USER pm2 startup systemd -u $DEPLOY_USER --hp /home/$DEPLOY_USER
sudo -u $DEPLOY_USER pm2 install pm2-logrotate
sudo -u $DEPLOY_USER pm2 set pm2-logrotate:max_size 10M
sudo -u $DEPLOY_USER pm2 set pm2-logrotate:retain 7
sudo -u $DEPLOY_USER pm2 set pm2-logrotate:compress true

# ============================================
# Step 8: SSL Certificate Setup
# ============================================
if [ "$USE_SELF_SIGNED_SSL" = true ]; then
    echo ""
    echo -e "${YELLOW}Self-signed SSL configured${NC}"
elif [ "$USE_SSL" = true ]; then
    echo ""
    echo -e "${YELLOW}Setting up SSL certificate...${NC}"
    read -p "Email for SSL notifications: " SSL_EMAIL
    if [ -z "$SSL_EMAIL" ]; then
        SSL_EMAIL="admin@$DOMAIN"
    fi
    certbot --nginx -d $DOMAIN -d $WWW_DOMAIN --non-interactive --agree-tos --email $SSL_EMAIL --redirect
    certbot renew --dry-run
fi

# ============================================
# Step 9: Verify Services
# ============================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
if [ "$USE_SSL" = true ]; then
    if [ "$USE_SELF_SIGNED_SSL" = true ]; then
        echo -e "${GREEN}Application: https://$SERVER_IP${NC}"
    else
        echo -e "${GREEN}Application: https://$DOMAIN${NC}"
    fi
else
    echo -e "${GREEN}Application: http://$SERVER_IP${NC}"
fi
echo ""
echo -e "${YELLOW}Webhook Secret: $WEBHOOK_SECRET${NC}"
echo -e "${YELLOW}Save this securely for webhook authentication${NC}"
echo ""

