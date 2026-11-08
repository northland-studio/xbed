#!/bin/bash
echo "=== routes/skins.js 全文 ==="
sed -n '1,140p' /var/www/xuanjian-guild/routes/skins.js
echo
echo "=== 路由挂载位置 ==="
grep -rn "skins" /var/www/xuanjian-guild/app.js /var/www/xuanjian-guild/*.js 2>/dev/null | head -6
echo
echo "=== nginx 是否直接暴露 /uploads ==="
grep -rn "uploads" /etc/nginx/sites-enabled/* 2>/dev/null | head -10
echo
echo "=== 测试公开接口（按游戏ID查皮肤）==="
for name in Morzane123 zjrmuran baiyangsz; do
  echo -n "  $name -> "
  curl -s --max-time 8 "http://127.0.0.1/api/skins/$name" | head -c 200
  echo
done
