#!/bin/bash
DB=/var/www/xbed/data/xbed.db
sqlite3 "$DB" "UPDATE seasons SET state='running', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1;"
echo "=== 赛季状态 ==="
sqlite3 -header -column "$DB" "SELECT id,code,state,registration_open,start_at,end_at FROM seasons;"
