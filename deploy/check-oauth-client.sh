#!/bin/bash
cd /var/www/xuanjian-guild || exit 1
echo "=== oauth_clients ==="
sqlite3 -header -column data/guild.db "SELECT id, client_id, name, is_confidential, is_active, redirect_uris, allowed_scopes FROM oauth_clients;" 2>&1 | head -20
