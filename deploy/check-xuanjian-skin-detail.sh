#!/bin/bash
DB=/var/www/xuanjian-guild/data/guild.db
echo "=== skin_path 使用率 ==="
sqlite3 "$DB" "SELECT COUNT(*) AS total, SUM(CASE WHEN skin_path IS NOT NULL AND skin_path<>'' THEN 1 ELSE 0 END) AS with_skin FROM users;"
echo
echo "=== 有皮肤的样例 ==="
sqlite3 -header -column "$DB" "SELECT id, username, skin_path FROM users WHERE skin_path IS NOT NULL AND skin_path<>'' LIMIT 8;"
echo
echo "=== 官网代码中 skin_path 的使用位置 ==="
cd /var/www/xuanjian-guild || exit 1
grep -rniE 'skin_path|skinUrl|skin_url' routes lib app.js 2>/dev/null | head -20
echo
echo "=== 皮肤文件目录 ==="
for d in uploads public/uploads ../uploads; do
  [ -d "$d" ] && { echo "  $d:"; ls "$d" 2>/dev/null | head -8; find "$d" -iname '*skin*' 2>/dev/null | head -5; }
done
echo
echo "=== 是否有皮肤渲染/预览相关接口 ==="
grep -rniE 'skin|render/body|3d' routes/*.js 2>/dev/null | grep -viE 'skin_path' | head -10
