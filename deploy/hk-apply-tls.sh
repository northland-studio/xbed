#!/bin/bash
set -e
cp /root/nginx-xbed-live.conf /etc/nginx/sites-available/xbed.xuanjian.top
ln -sf /etc/nginx/sites-available/xbed.xuanjian.top /etc/nginx/sites-enabled/xbed.xuanjian.top
nginx -t 2>&1 | tail -2
systemctl reload nginx
sleep 2
echo "=== 本地 TLS 验证（绕过 Cloudflare）==="
curl -s -o /dev/null -w "  本地 https 首页 -> %{http_code}\n" --resolve "xbed.xuanjian.top:443:127.0.0.1" https://xbed.xuanjian.top/
curl -s --resolve "xbed.xuanjian.top:443:127.0.0.1" https://xbed.xuanjian.top/api/health; echo
echo "=== 经 Cloudflare 验证 ==="
curl -s -o /dev/null -w "  CF https 首页 -> %{http_code}\n" --max-time 15 https://xbed.xuanjian.top/
curl -s --max-time 15 https://xbed.xuanjian.top/api/health; echo
echo "=== HTTP 跳转 ==="
curl -s -o /dev/null -w "  http -> %{http_code}\n" --max-time 15 http://xbed.xuanjian.top/
