#!/bin/bash
# Backup script for Android Device Management Dashboard
# This script backs up devices.json and maintains a rolling backup history

BACKUP_DIR="/var/backups/android-dashboard"
PROJECT_DIR="/var/www/android-device-dashboard"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if devices.json exists
if [ ! -f "$PROJECT_DIR/devices.json" ]; then
    echo "⚠️  devices.json not found at $PROJECT_DIR/devices.json"
    exit 1
fi

# Create backup
cp "$PROJECT_DIR/devices.json" "$BACKUP_DIR/devices_$DATE.json"

# Compress old backups (older than 7 days)
find "$BACKUP_DIR" -name "devices_*.json" -mtime +7 -exec gzip {} \;

# Keep only last 30 days of backups (compressed or not)
find "$BACKUP_DIR" -name "devices_*.json" -mtime +30 -delete
find "$BACKUP_DIR" -name "devices_*.json.gz" -mtime +30 -delete

echo "✅ Backup created: devices_$DATE.json"
echo "📁 Backup location: $BACKUP_DIR"

