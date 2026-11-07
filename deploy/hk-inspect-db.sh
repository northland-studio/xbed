#!/bin/bash
DB=/var/www/xbed/data/xbed.db
echo "=== 赛季状态 ==="
sqlite3 -header -column "$DB" "SELECT id,code,state,registration_open,start_at,end_at FROM seasons;"
echo
echo "=== 最近比赛 ==="
sqlite3 -header -column "$DB" "SELECT id,external_match_id,season_id,state,abnormal_reason,started_at,ended_at FROM matches ORDER BY id DESC LIMIT 5;"
echo
echo "=== 系统设置 ==="
sqlite3 -header -column "$DB" "SELECT key,value FROM system_settings LIMIT 20;"
echo
echo "=== API 错误日志尾部 ==="
tail -20 /var/www/xbed/logs/api-error.log 2>/dev/null
tail -10 /var/www/xbed/logs/api-out.log 2>/dev/null
