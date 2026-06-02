#!/bin/bash
BACKUP_DIR="/opt/signal-dashboard/backups"
mkdir -p $BACKUP_DIR
DB_FILE="/opt/signal-dashboard/backend/cache.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp $DB_FILE $BACKUP_DIR/cache.db.backup.$TIMESTAMP
# Keep only last 30 backups
ls -1t $BACKUP_DIR/cache.db.backup.* | tail -n +31 | xargs -r rm
