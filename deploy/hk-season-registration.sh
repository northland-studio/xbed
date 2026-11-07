#!/bin/bash
DB=/var/www/xbed/data/xbed.db
sqlite3 "$DB" "UPDATE seasons SET state='registration', registration_open=1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1;"
echo "=== 赛季状态 ==="
sqlite3 -header -column "$DB" "SELECT id,code,state,registration_open,start_at,end_at FROM seasons;"
echo
echo "=== 从 HK 访问域名（HTTP/HTTPS）==="
curl -s -o /dev/null -w "  http://xbed.xuanjian.top/ -> %{http_code}\n" --max-time 10 http://xbed.xuanjian.top/ || true
curl -s -o /dev/null -w "  https://xbed.xuanjian.top/ -> %{http_code}\n" --max-time 10 -k https://xbed.xuanjian.top/ || true
curl -s --max-time 10 -o /dev/null -w "  https API health -> %{http_code}\n" -k https://xbed.xuanjian.top/api/health || true
echo
echo "=== 证书现状 ==="
ls /etc/letsencrypt/live/ 2>/dev/null | head -10
