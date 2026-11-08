#!/bin/bash
DB=/var/www/xuanjian-guild/data/guild.db
echo "=== 玄剑官网 users 表字段 ==="
sqlite3 "$DB" "PRAGMA table_info(users);" | awk -F'|' '{print "  "$2" ("$3")"}'
echo
echo "=== 是否含 skin/avatar/皮肤 相关字段 ==="
sqlite3 "$DB" "PRAGMA table_info(users);" | grep -iE 'skin|avatar|uuid|face|head|icon'
echo
echo "=== OAuth userinfo 返回字段（源码）==="
cd /var/www/xuanjian-guild || exit 1
grep -n "router.get('/userinfo'" -A30 routes/oauth.js | head -40
echo
echo "=== 官网代码中是否出现 crafatar / mc-heads / 皮肤 ==="
grep -rniE 'crafatar|mc-heads|minotar|skin|皮肤' routes lib 2>/dev/null | head -12
