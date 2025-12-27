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
echo -e "${GREEN}Production Deployment Script${NC}"
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
echo -e "${YELLOW}Step 1: Configuration${NC}"
echo "Please provide the following information:"
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
echo -e "${GREEN}Configuration collected!${NC}"
echo "Server IP: $SERVER_IP"
echo "Domain: $DOMAIN"
if [ "$USE_SSL" = true ]; then
    if [ "$USE_SELF_SIGNED_SSL" = true ]; then
        echo "SSL: Enabled (Self-Signed Certificate)"
    else
        echo "WWW Domain: $WWW_DOMAIN"
        echo "SSL: Enabled (Let's Encrypt)"
    fi
else
    echo "SSL: Disabled (HTTP only)"
fi
echo "Deploy User: $DEPLOY_USER"
echo "Deploy Directory: $DEPLOY_DIR"
echo ""
read -p "Continue? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Deployment cancelled."
    exit 0
fi

# ============================================
# Step 2: Install System Dependencies
# ============================================
echo ""
echo -e "${YELLOW}Step 2: Installing system dependencies...${NC}"
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw

# Install Node.js 20+
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
    echo "Installing/Upgrading to Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

echo -e "${GREEN}System dependencies installed!${NC}"

# ============================================
# Step 3: Clone and Setup Application
# ============================================
echo ""
echo -e "${YELLOW}Step 3: Setting up application...${NC}"

# Create deployment directory
mkdir -p /var/www
cd /var/www

# Remove existing if present
if [ -d "android-device-dashboard" ]; then
    echo "Removing existing installation..."
    rm -rf android-device-dashboard
fi

# Clone repository
echo "Cloning repository..."
git clone -b $BRANCH $REPO_URL android-device-dashboard
cd android-device-dashboard

# Set ownership
chown -R $DEPLOY_USER:$DEPLOY_USER /var/www/android-device-dashboard

# Create environment file BEFORE build (Next.js needs env vars during build)
echo "Creating environment file for build..."
cd /var/www/android-device-dashboard

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

# Validate environment variables - warn about port 8080 (development port)
echo ""
echo -e "${YELLOW}Validating environment variables...${NC}"
if echo "$APP_URL" | grep -q ":8080"; then
    echo -e "${RED}⚠️  WARNING: Port 8080 detected in APP_URL!${NC}"
    echo -e "${RED}   Port 8080 is only for development (dev-proxy.js).${NC}"
    echo -e "${RED}   Production should use port 80 (HTTP) or 443 (HTTPS) through Nginx.${NC}"
    echo -e "${YELLOW}   Current APP_URL: $APP_URL${NC}"
    read -p "Continue anyway? (y/n): " CONTINUE_WITH_8080
    if [ "$CONTINUE_WITH_8080" != "y" ]; then
        echo "Deployment cancelled. Please fix the URL configuration."
        exit 1
    fi
fi

# Check NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_SITE_URL for port 8080
if echo "$NEXT_PUBLIC_APP_URL" 2>/dev/null | grep -q ":8080" || \
   echo "$NEXT_PUBLIC_SITE_URL" 2>/dev/null | grep -q ":8080"; then
    echo -e "${RED}⚠️  WARNING: Port 8080 detected in environment variables!${NC}"
    echo -e "${RED}   This will cause browser to load resources from wrong port.${NC}"
fi

echo -e "${GREEN}Environment file created and validated!${NC}"

# Install all dependencies (including dev for build)
echo "Installing dependencies..."
sudo -u $DEPLOY_USER npm install --legacy-peer-deps

# Build Next.js (requires dev dependencies and env vars)
echo "Building Next.js application..."
sudo -u $DEPLOY_USER npm run build

# Remove dev dependencies after build to save space
echo "Removing dev dependencies..."
sudo -u $DEPLOY_USER npm prune --production

# Create logs directory
mkdir -p logs
chown -R $DEPLOY_USER:$DEPLOY_USER logs

echo -e "${GREEN}Application setup complete!${NC}"

# ============================================
# Step 4: Verify Environment File
# ============================================
echo ""
echo -e "${YELLOW}Step 4: Verifying environment configuration...${NC}"

# Environment file was already created in Step 3 before build
# Just verify it exists and display the webhook secret reminder
if [ -f ".env.production" ]; then
    echo -e "${GREEN}Environment file verified!${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT SECURITY NOTE:${NC}"
    echo "Webhook Secret has been set. To send webhook requests, use:"
    echo "  Authorization: Bearer $WEBHOOK_SECRET"
    echo ""
    echo -e "${YELLOW}Save this webhook secret securely!${NC}"
else
    echo -e "${RED}ERROR: Environment file not found!${NC}"
    exit 1
fi

# ============================================
# Step 5: Configure Firewall
# ============================================
echo ""
echo -e "${YELLOW}Step 5: Configuring firewall...${NC}"

# Allow SSH first (important!)
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Block internal ports
ufw deny 3000/tcp
ufw deny 9211/tcp

# Enable firewall
ufw --force enable

echo -e "${GREEN}Firewall configured!${NC}"

# ============================================
# Step 6: Configure Nginx
# ============================================
echo ""
echo -e "${YELLOW}Step 6: Configuring Nginx...${NC}"

# Copy and customize nginx config
cp nginx.conf.example /etc/nginx/sites-available/android-dashboard

# Replace domain placeholders
sed -i "s/yourdomain.com/$DOMAIN/g" /etc/nginx/sites-available/android-dashboard
sed -i "s/www.yourdomain.com/$WWW_DOMAIN/g" /etc/nginx/sites-available/android-dashboard

# If using IP address with self-signed SSL, create SSL config
if [ "$USE_SELF_SIGNED_SSL" = true ]; then
    echo "Creating SSL configuration with self-signed certificate for IP address..."
    CERT_FILE="/etc/ssl/certs/ip-ssl-$SERVER_IP.crt"
    KEY_FILE="/etc/ssl/private/ip-ssl-$SERVER_IP.key"
    
    # Generate self-signed certificate if it doesn't exist
    if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
        echo "Generating self-signed certificate..."
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
    echo "Creating HTTP-only configuration for IP address..."
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

# Test nginx configuration
nginx -t

# Start nginx
systemctl restart nginx
systemctl enable nginx

echo -e "${GREEN}Nginx configured!${NC}"

# ============================================
# Step 7: Setup PM2
# ============================================
echo ""
echo -e "${YELLOW}Step 7: Setting up PM2...${NC}"

# Start applications with PM2
cd /var/www/android-device-dashboard
sudo -u $DEPLOY_USER pm2 start ecosystem.config.js
sudo -u $DEPLOY_USER pm2 save

# Setup PM2 startup
sudo -u $DEPLOY_USER pm2 startup systemd -u $DEPLOY_USER --hp /home/$DEPLOY_USER

# Install log rotation
sudo -u $DEPLOY_USER pm2 install pm2-logrotate
sudo -u $DEPLOY_USER pm2 set pm2-logrotate:max_size 10M
sudo -u $DEPLOY_USER pm2 set pm2-logrotate:retain 7
sudo -u $DEPLOY_USER pm2 set pm2-logrotate:compress true

echo -e "${GREEN}PM2 configured!${NC}"

# ============================================
# Step 8: SSL Certificate Setup
# ============================================
if [ "$USE_SELF_SIGNED_SSL" = true ]; then
    echo ""
    echo -e "${YELLOW}Step 8: Self-signed SSL certificate already configured${NC}"
    echo -e "${GREEN}Self-signed certificate generated and configured in Nginx!${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT SECURITY NOTES:${NC}"
    echo "1. This is a SELF-SIGNED certificate"
    echo "2. Browsers will show 'Not Secure' warnings"
    echo "3. Users must manually accept the certificate"
    echo "4. Not recommended for public production use"
    echo ""
    echo -e "${YELLOW}For production, consider:${NC}"
    echo "- Getting a domain name (even \$1-10/year)"
    echo "- Using Let's Encrypt for free, trusted certificates"
elif [ "$USE_SSL" = true ]; then
    echo ""
    echo -e "${YELLOW}Step 8: Setting up SSL certificate (Let's Encrypt)...${NC}"
    echo "This will prompt for your email address."
    echo ""

    read -p "Email for SSL certificate notifications: " SSL_EMAIL
    if [ -z "$SSL_EMAIL" ]; then
        SSL_EMAIL="admin@$DOMAIN"
    fi

    # Obtain SSL certificate
    certbot --nginx -d $DOMAIN -d $WWW_DOMAIN --non-interactive --agree-tos --email $SSL_EMAIL --redirect

    # Test auto-renewal
    certbot renew --dry-run

    echo -e "${GREEN}SSL certificate configured!${NC}"
else
    echo ""
    echo -e "${YELLOW}Step 8: Skipping SSL (using HTTP only)${NC}"
    echo -e "${YELLOW}Note: For SSL, either use a domain name with Let's Encrypt${NC}"
    echo -e "${YELLOW}      or enable self-signed certificate option.${NC}"
fi

# ============================================
# Step 9: Verify Services
# ============================================
echo ""
echo -e "${YELLOW}Step 9: Verifying services...${NC}"

# Check PM2 status
echo "PM2 Status:"
sudo -u $DEPLOY_USER pm2 status

# Check nginx status
echo ""
echo "Nginx Status:"
systemctl status nginx --no-pager | head -5

# Check firewall status
echo ""
echo "Firewall Status:"
ufw status | head -10

# Check listening ports
echo ""
echo "Listening Ports:"
ss -tulpn | grep -E ':(3000|9211|80|443)' || echo "Ports check complete"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Your application is now running at:"
if [ "$USE_SSL" = true ]; then
    if [ "$USE_SELF_SIGNED_SSL" = true ]; then
        echo -e "${GREEN}https://$SERVER_IP${NC}"
        echo -e "${YELLOW}(Note: Browser will show security warning for self-signed certificate)${NC}"
    else
        echo -e "${GREEN}https://$DOMAIN${NC}"
    fi
else
    echo -e "${GREEN}http://$SERVER_IP${NC}"
fi
echo ""
echo "Environment file created at: $DEPLOY_DIR/.env.production"
echo ""
echo "Next steps:"
echo "1. Verify the application is accessible"
echo "2. Check PM2 logs: pm2 logs"
echo "3. Check Nginx logs: tail -f /var/log/nginx/error.log"
echo ""
echo "Useful commands:"
echo "  pm2 status          - Check application status"
echo "  pm2 logs            - View application logs"
echo "  pm2 restart all     - Restart all services"
echo "  systemctl status nginx - Check nginx status"
echo ""

