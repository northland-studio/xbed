#!/bin/bash
set -e
DB=/var/www/xbed/data/xbed.db
SID=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
EXP=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%S.000Z)
sqlite3 "$DB" "INSERT INTO sessions (id, user_id, level_snapshot, ip, user_agent, created_at, expires_at) VALUES ('$SID', 1, 2, '127.0.0.1', 'ops-verify', '$NOW', '$EXP');"
echo "=== 临时会话已创建（验证后删除）==="

echo "=== GET /api/admin/matches/7 ==="
curl -s -o /tmp/match7.json -w "  HTTP %{http_code}\n" -H "Cookie: xbed_sess=$SID" http://127.0.0.1:3939/api/admin/matches/7
head -c 600 /tmp/match7.json; echo

echo "=== GET /api/admin/matches/7/events ==="
curl -s -o /tmp/m7events.json -w "  HTTP %{http_code}\n" -H "Cookie: xbed_sess=$SID" http://127.0.0.1:3939/api/admin/matches/7/events
head -c 400 /tmp/m7events.json; echo

echo "=== 清理临时会话 ==="
sqlite3 "$DB" "DELETE FROM sessions WHERE id = '$SID';"
echo "  done"
