#!/bin/bash

# ============================================
# Generate Self-Signed SSL Certificate for IP Address
# ============================================
# This script generates a self-signed SSL certificate
# for use with an IP address instead of a domain name.
#
# WARNING: Self-signed certificates are NOT trusted by browsers
# by default. Users will see security warnings and must manually
# accept the certificate. This is suitable for:
# - Development/testing environments
# - Internal/private networks
# - Temporary setups
#
# For production, use a domain name with Let's Encrypt instead.
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Get IP address from argument or prompt
if [ -z "$1" ]; then
    read -p "Enter IP address for certificate: " IP_ADDRESS
else
    IP_ADDRESS=$1
fi

if [ -z "$IP_ADDRESS" ]; then
    echo -e "${RED}IP address is required!${NC}"
    exit 1
fi

# Validate IP address format (basic check)
if ! [[ $IP_ADDRESS =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    echo -e "${RED}Invalid IP address format: $IP_ADDRESS${NC}"
    exit 1
fi

# Certificate configuration
CERT_DIR="/etc/ssl/certs"
KEY_DIR="/etc/ssl/private"
CERT_FILE="$CERT_DIR/ip-ssl-$IP_ADDRESS.crt"
KEY_FILE="$KEY_DIR/ip-ssl-$IP_ADDRESS.key"
DAYS_VALID=365

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Generating Self-Signed SSL Certificate${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "IP Address: $IP_ADDRESS"
echo "Certificate: $CERT_FILE"
echo "Private Key: $KEY_FILE"
echo "Valid for: $DAYS_VALID days"
echo ""

# Create directories if they don't exist
mkdir -p $CERT_DIR
mkdir -p $KEY_DIR

# Check if certificate already exists
if [ -f "$CERT_FILE" ] || [ -f "$KEY_FILE" ]; then
    echo -e "${YELLOW}Certificate or key already exists!${NC}"
    read -p "Overwrite? (y/n): " OVERWRITE
    if [ "$OVERWRITE" != "y" ]; then
        echo "Aborted."
        exit 0
    fi
    # Remove existing files
    rm -f $CERT_FILE $KEY_FILE
fi

# Generate self-signed certificate with IP in Subject Alternative Name
echo "Generating certificate..."
openssl req -x509 -nodes -days $DAYS_VALID -newkey rsa:2048 \
    -keyout $KEY_FILE \
    -out $CERT_FILE \
    -subj "/CN=$IP_ADDRESS/O=Self-Signed Certificate/C=US" \
    -addext "subjectAltName=IP:$IP_ADDRESS" \
    2>/dev/null

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to generate certificate!${NC}"
    exit 1
fi

# Set proper permissions
chmod 644 $CERT_FILE
chmod 600 $KEY_FILE
chown root:root $CERT_FILE $KEY_FILE

echo ""
echo -e "${GREEN}Certificate generated successfully!${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT SECURITY NOTES:${NC}"
echo "1. This is a SELF-SIGNED certificate"
echo "2. Browsers will show 'Not Secure' warnings"
echo "3. Users must manually accept the certificate"
echo "4. Not recommended for public production use"
echo ""
echo -e "${YELLOW}For production, consider:${NC}"
echo "- Getting a domain name (even $1-10/year)"
echo "- Using Let's Encrypt for free, trusted certificates"
echo ""
echo "Certificate files:"
echo "  Certificate: $CERT_FILE"
echo "  Private Key: $KEY_FILE"
echo ""
echo -e "${GREEN}You can now configure Nginx to use these certificates.${NC}"

