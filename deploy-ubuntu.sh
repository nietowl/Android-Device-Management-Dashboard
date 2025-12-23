#!/bin/bash
# Simple Ubuntu Deployment Script
# Run this script on your Ubuntu server to deploy the application

set -e  # Exit on error

echo "========================================"
echo "  Android Dashboard - Ubuntu Deployment"
echo "========================================"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Please run with sudo: sudo ./deploy-ubuntu.sh"
    exit 1
fi

# Step 1: Fix repositories and update system
echo "[1/8] Fixing repositories and updating system packages..."

# Check Ubuntu version
UBUNTU_VERSION=$(lsb_release -rs)
UBUNTU_CODENAME=$(lsb_release -cs)

echo "  Detected Ubuntu $UBUNTU_VERSION ($UBUNTU_CODENAME)"

# Fix repositories for old Ubuntu versions (EOL releases)
if [ "$UBUNTU_CODENAME" = "kinetic" ] || [ "$UBUNTU_CODENAME" = "impish" ] || [ "$UBUNTU_CODENAME" = "hirsute" ]; then
    echo "  ⚠️  Ubuntu $UBUNTU_CODENAME is EOL. Updating repositories to old-releases..."
    sed -i 's|http://archive.ubuntu.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' /etc/apt/sources.list
    sed -i 's|http://security.ubuntu.com/ubuntu|http://old-releases.ubuntu.com/ubuntu|g' /etc/apt/sources.list
    echo "  ✅ Repositories updated to old-releases"
fi

apt update && apt upgrade -y

# Step 2: Install Node.js 20 (LTS)
echo "[2/8] Installing Node.js 20 (LTS)..."
if ! command -v node &> /dev/null; then
    echo "  Installing Node.js 20.x from NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    echo "  ✅ Node.js installed: $(node --version)"
else
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "  ⚠️  Node.js version is too old ($(node --version)). Upgrading to Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt install -y nodejs
        echo "  ✅ Node.js upgraded to: $(node --version)"
    else
        echo "  ✅ Node.js already installed: $(node --version)"
    fi
fi

# Step 3: Install PM2
echo "[3/8] Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 7
else
    echo "  ✅ PM2 already installed"
fi

# Step 4: Install Nginx
echo "[4/8] Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
else
    echo "  ✅ Nginx already installed"
fi

# Step 5: Install Certbot
echo "[5/8] Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
else
    echo "  ✅ Certbot already installed"
fi

# Step 6: Setup application directory
echo "[6/8] Setting up application..."
APP_DIR="/var/www/android-device-dashboard"

if [ ! -d "$APP_DIR" ]; then
    echo "  ⚠️  Application directory not found at $APP_DIR"
    echo "  Please clone your repository to $APP_DIR first"
    echo "  Example: git clone <your-repo-url> $APP_DIR"
    exit 1
fi

cd "$APP_DIR"

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install --production
else
    echo "  ✅ Dependencies already installed"
fi

# Build application
if [ ! -d ".next" ]; then
    echo "  Building application..."
    npm run build
else
    echo "  ✅ Application already built"
fi

# Create logs directory
mkdir -p logs

# Step 7: Check environment file
echo "[7/8] Checking environment configuration..."
if [ ! -f ".env.production" ]; then
    echo "  ⚠️  .env.production not found!"
    echo "  Creating template..."
    cat > .env.production << 'EOF'
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Application URLs
NEXT_PUBLIC_APP_URL=https://yourdomain.com
DEVICE_SERVER_URL=http://localhost:9211
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Server Configuration
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# Webhook Security (Required in production)
WEBHOOK_SECRET=change_this_to_a_random_32_character_string
EOF
    chmod 600 .env.production
    echo "  ✅ Created .env.production template"
    echo ""
    echo "  ⚠️  IMPORTANT: Edit .env.production and add your actual values!"
    echo "  Then run this script again or start manually with: pm2 start ecosystem.config.js"
    exit 0
else
    echo "  ✅ .env.production found"
    chmod 600 .env.production
fi

# Step 8: Configure firewall
echo "[8/8] Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp  # SSH
    ufw allow 80/tcp  # HTTP
    ufw allow 443/tcp # HTTPS
    ufw allow 9211/tcp # Device Server
    ufw --force enable
    echo "  ✅ Firewall configured"
else
    echo "  ⚠️  UFW not found, skipping firewall configuration"
fi

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
STARTUP_CMD=$(pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER | grep "sudo")
if [ ! -z "$STARTUP_CMD" ]; then
    echo "  Run this command to enable PM2 on boot:"
    echo "  $STARTUP_CMD"
fi

echo ""
echo "========================================"
echo "  ✅ Deployment Complete!"
echo "========================================"
echo ""
echo "Application Status:"
pm2 status
echo ""
echo "Next steps:"
echo "  1. Edit .env.production with your actual values"
echo "  2. Configure Nginx (see DEPLOYMENT.md)"
echo "  3. Setup SSL certificate: sudo certbot --nginx -d yourdomain.com"
echo ""
echo "Useful commands:"
echo "  pm2 logs              - View logs"
echo "  pm2 status            - Check status"
echo "  pm2 restart all       - Restart application"
echo "  pm2 stop all          - Stop application"
echo ""

