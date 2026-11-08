#!/bin/bash
cd /var/www/xuanjian-guild || exit 1
echo "=== app.js 中 skins 挂载 ==="
grep -n "skins" app.js | head -10
echo
echo "=== 路由文件结构（skins.js 尾部）==="
tail -20 routes/skins.js
echo
echo "=== static /uploads 挂载 ==="
grep -n "uploads" app.js | head -10
echo
echo "=== 现有 rateLimit / 缓存中间件用法示例 ==="
grep -rn "rateLimit" routes/*.js | head -5
echo
echo "=== pm2 进程名 ==="
pm2 list | grep -E 'xuanjian-guild|guild' | head -3
