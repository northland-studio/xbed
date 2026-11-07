#!/bin/bash
DB=/var/www/xuanjian-guild/data/guild.db
echo "=== users 表 is_member 分布 ==="
sqlite3 -header -column "$DB" "SELECT is_member, COUNT(*) AS cnt FROM users GROUP BY is_member;" 2>&1
echo
echo "=== 字段是否存在 ==="
sqlite3 "$DB" "PRAGMA table_info(users);" | grep -iE 'member|game_id|level|frozen' | head -10
echo
echo "=== 会员判定逻辑（源码搜索）==="
cd /var/www/xuanjian-guild || exit 1
grep -rn "is_member" routes lib 2>/dev/null | head -20
