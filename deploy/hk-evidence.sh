#!/bin/bash
DB=/var/www/xbed/data/xbed.db
echo "=== 用户与会话 ==="
sqlite3 -header -column "$DB" "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS sessions FROM sessions;"
echo
echo "=== 用户列表（前 8，已脱敏）==="
sqlite3 -header -column "$DB" "SELECT id, xuanjian_user_id, username, nickname, level, email_verified, created_at FROM users ORDER BY id LIMIT 8;"
echo
echo "=== 赛季（谁改的）==="
sqlite3 -header -column "$DB" "SELECT id,code,state,registration_open,start_at,end_at,updated_at,created_by FROM seasons;"
echo
echo "=== 最近审计 ==="
sqlite3 -header -column "$DB" "SELECT id,actor_user_id,action,target_type,target_id,substr(reason,1,20) AS reason,created_at FROM audit_logs ORDER BY id DESC LIMIT 10;"
echo
echo "=== 最近比赛 ==="
sqlite3 -header -column "$DB" "SELECT id,external_match_id,season_id,state,abnormal_reason,created_at FROM matches ORDER BY id DESC LIMIT 5;"
