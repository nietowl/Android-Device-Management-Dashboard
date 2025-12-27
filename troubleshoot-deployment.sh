#!/bin/bash

# Troubleshooting script for production deployment
# Run this on your server to diagnose why the web UI isn't showing

echo "=========================================="
echo "Production Deployment Troubleshooting"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Is Next.js app built?
echo -e "${YELLOW}1. Checking if Next.js app is built...${NC}"
if [ -d ".next" ]; then
    echo -e "${GREEN}✅ .next directory exists${NC}"
else
    echo -e "${RED}❌ .next directory not found - app needs to be built${NC}"
    echo "   Run: npm run build"
fi
echo ""

# Check 2: Is Next.js server running?
echo -e "${YELLOW}2. Checking if Next.js server is running on port 3000...${NC}"
if sudo ss -tulpn | grep -q ":3000"; then
    echo -e "${GREEN}✅ Port 3000 is in use${NC}"
    sudo ss -tulpn | grep ":3000"
else
    echo -e "${RED}❌ Port 3000 is NOT in use - server is not running${NC}"
    echo "   Start with: npm start"
    echo "   Or with PM2: pm2 start ecosystem.config.js --only android-dashboard"
fi
echo ""

# Check 3: Can we connect to localhost:3000?
echo -e "${YELLOW}3. Testing connection to localhost:3000...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ Server responds on localhost:3000${NC}"
else
    echo -e "${RED}❌ Cannot connect to localhost:3000${NC}"
    echo "   Server may not be running or there's an error"
fi
echo ""

# Check 4: Is Nginx running?
echo -e "${YELLOW}4. Checking if Nginx is running...${NC}"
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ Nginx is running${NC}"
else
    echo -e "${RED}❌ Nginx is NOT running${NC}"
    echo "   Start with: sudo systemctl start nginx"
fi
echo ""

# Check 5: Is Nginx configured?
echo -e "${YELLOW}5. Checking Nginx configuration...${NC}"
if [ -f "/etc/nginx/sites-available/android-dashboard" ]; then
    echo -e "${GREEN}✅ Nginx config file exists${NC}"
    if [ -L "/etc/nginx/sites-enabled/android-dashboard" ]; then
        echo -e "${GREEN}✅ Nginx config is enabled${NC}"
    else
        echo -e "${RED}❌ Nginx config is NOT enabled${NC}"
        echo "   Enable with: sudo ln -s /etc/nginx/sites-available/android-dashboard /etc/nginx/sites-enabled/"
    fi
else
    echo -e "${RED}❌ Nginx config file not found${NC}"
    echo "   Create config at: /etc/nginx/sites-available/android-dashboard"
fi
echo ""

# Check 6: Nginx config syntax
echo -e "${YELLOW}6. Checking Nginx configuration syntax...${NC}"
if sudo nginx -t 2>&1 | grep -q "successful"; then
    echo -e "${GREEN}✅ Nginx configuration is valid${NC}"
else
    echo -e "${RED}❌ Nginx configuration has errors${NC}"
    sudo nginx -t
fi
echo ""

# Check 7: Are ports 80 and 443 listening?
echo -e "${YELLOW}7. Checking if ports 80 and 443 are listening...${NC}"
if sudo ss -tulpn | grep -q ":80 "; then
    echo -e "${GREEN}✅ Port 80 is listening${NC}"
else
    echo -e "${RED}❌ Port 80 is NOT listening${NC}"
fi
if sudo ss -tulpn | grep -q ":443 "; then
    echo -e "${GREEN}✅ Port 443 is listening${NC}"
else
    echo -e "${RED}❌ Port 443 is NOT listening${NC}"
fi
echo ""

# Check 8: SSL certificate for IP
echo -e "${YELLOW}8. Checking SSL certificate...${NC}"
SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
if [ -f "/etc/ssl/certs/ip-ssl-${SERVER_IP}.crt" ]; then
    echo -e "${GREEN}✅ SSL certificate found for IP: ${SERVER_IP}${NC}"
elif [ -f "/etc/letsencrypt/live/*/fullchain.pem" ]; then
    echo -e "${GREEN}✅ Let's Encrypt certificate found${NC}"
else
    echo -e "${YELLOW}⚠️  No SSL certificate found${NC}"
    echo "   For IP address, generate self-signed cert:"
    echo "   sudo bash scripts/generate-self-signed-cert.sh ${SERVER_IP}"
fi
echo ""

# Check 9: Firewall status
echo -e "${YELLOW}9. Checking firewall status...${NC}"
if command -v ufw &> /dev/null; then
    if sudo ufw status | grep -q "Status: active"; then
        echo -e "${YELLOW}⚠️  UFW firewall is active${NC}"
        echo "   Ensure ports 80 and 443 are allowed:"
        echo "   sudo ufw allow 80/tcp"
        echo "   sudo ufw allow 443/tcp"
    else
        echo -e "${GREEN}✅ UFW firewall is inactive${NC}"
    fi
elif command -v firewall-cmd &> /dev/null; then
    echo -e "${YELLOW}⚠️  firewalld is installed${NC}"
    echo "   Check if ports 80 and 443 are open"
else
    echo -e "${YELLOW}⚠️  No firewall utility detected${NC}"
fi
echo ""

# Check 10: PM2 status (if using PM2)
echo -e "${YELLOW}10. Checking PM2 status...${NC}"
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "android-dashboard"; then
        echo -e "${GREEN}✅ PM2 process 'android-dashboard' found${NC}"
        pm2 list | grep "android-dashboard"
    else
        echo -e "${YELLOW}⚠️  PM2 process 'android-dashboard' not found${NC}"
        echo "   Start with: pm2 start ecosystem.config.js --only android-dashboard"
    fi
else
    echo -e "${YELLOW}⚠️  PM2 not installed${NC}"
fi
echo ""

# Check 11: Environment variables
echo -e "${YELLOW}11. Checking critical environment variables...${NC}"
if [ -f ".env.production" ]; then
    echo -e "${GREEN}✅ .env.production file exists${NC}"
    if grep -q "NEXT_PUBLIC_SITE_URL" .env.production; then
        SITE_URL=$(grep "NEXT_PUBLIC_SITE_URL" .env.production | cut -d '=' -f2)
        echo -e "${GREEN}✅ NEXT_PUBLIC_SITE_URL is set: ${SITE_URL}${NC}"
    else
        echo -e "${RED}❌ NEXT_PUBLIC_SITE_URL is NOT set${NC}"
    fi
else
    echo -e "${RED}❌ .env.production file not found${NC}"
fi
echo ""

# Check 12: Test external access
echo -e "${YELLOW}12. Testing external access...${NC}"
SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
echo "   Testing HTTP (port 80)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://${SERVER_IP} || echo "000")
if [ "$HTTP_CODE" != "000" ]; then
    echo -e "${GREEN}✅ HTTP responds with code: ${HTTP_CODE}${NC}"
else
    echo -e "${RED}❌ HTTP connection failed${NC}"
fi

echo "   Testing HTTPS (port 443)..."
HTTPS_CODE=$(curl -s -k -o /dev/null -w "%{http_code}" https://${SERVER_IP} || echo "000")
if [ "$HTTPS_CODE" != "000" ]; then
    echo -e "${GREEN}✅ HTTPS responds with code: ${HTTPS_CODE}${NC}"
else
    echo -e "${RED}❌ HTTPS connection failed${NC}"
fi
echo ""

# Summary
echo "=========================================="
echo "Summary & Quick Fixes"
echo "=========================================="
echo ""
echo "If server is not running:"
echo "  1. Build the app: npm run build"
echo "  2. Start the server: npm start"
echo "  Or with PM2: pm2 start ecosystem.config.js"
echo ""
echo "If Nginx is not configured:"
echo "  1. Copy nginx.conf.example to /etc/nginx/sites-available/android-dashboard"
echo "  2. Update server_name to your IP: 45.138.16.238"
echo "  3. Enable: sudo ln -s /etc/nginx/sites-available/android-dashboard /etc/nginx/sites-enabled/"
echo "  4. Test: sudo nginx -t"
echo "  5. Reload: sudo systemctl reload nginx"
echo ""
echo "If using IP address with HTTPS:"
echo "  1. Generate self-signed cert: sudo bash scripts/generate-self-signed-cert.sh 45.138.16.238"
echo "  2. Update nginx config to use the certificate paths"
echo ""
echo "Check logs:"
echo "  - Next.js: pm2 logs android-dashboard"
echo "  - Nginx: sudo tail -f /var/log/nginx/error.log"
echo ""

