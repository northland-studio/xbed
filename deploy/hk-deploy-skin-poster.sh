#!/bin/bash
set -e
APP=/var/www/xbed

echo "=== 1. 配置官网内网地址（皮肤查询走本机 3000，避免公网抖动）==="
ENVF=$APP/api/.env
if grep -q '^XUANJIAN_SITE_URL=' "$ENVF" 2>/dev/null; then
  sed -i 's#^XUANJIAN_SITE_URL=.*#XUANJIAN_SITE_URL=http://127.0.0.1:3000#' "$ENVF"
else
  echo 'XUANJIAN_SITE_URL=http://127.0.0.1:3000' >> "$ENVF"
fi
grep '^XUANJIAN_SITE_URL=' "$ENVF"

echo "=== 2. 部署后端 ==="
cd $APP/api
rm -rf dist.tmp && mkdir dist.tmp
tar -xzf /root/api6.tgz -C dist.tmp
rm -rf dist && mv dist.tmp/dist dist
pm2 restart xbed-api --update-env >/dev/null
sleep 5
curl -s --max-time 8 http://127.0.0.1:3939/api/health; echo

echo "=== 3. 部署前端 ==="
rm -rf $APP/web.tmp && mkdir -p $APP/web.tmp
tar -xzf /root/web6.tgz -C $APP/web.tmp
rm -rf $APP/web && mv $APP/web.tmp/dist $APP/web
rm -rf $APP/web.tmp
systemctl reload nginx

echo "=== 4. 皮肤接口验证 ==="
curl -s -o /tmp/skin-m.png -w "  /api/skin/Morzane123 -> %{http_code} %{content_type} %{size_download} bytes\n" --max-time 12 http://127.0.0.1:3939/api/skin/Morzane123
file /tmp/skin-m.png 2>/dev/null
curl -s -o /tmp/skin-none.png -w "  /api/skin/NoSuchUser -> %{http_code} %{content_type}\n" --max-time 12 http://127.0.0.1:3939/api/skin/NoSuchUser
curl -s -o /dev/null -w "  /api/skin/bad! -> %{http_code}\n" --max-time 8 "http://127.0.0.1:3939/api/skin/bad%21"

echo "=== 5. 线上验证（经 Cloudflare）==="
curl -s -o /dev/null -w "  https 皮肤 -> %{http_code} %{content_type}\n" --max-time 20 https://xbed.xuanjian.top/api/skin/Morzane123
curl -s -o /dev/null -w "  https 首页 -> %{http_code}\n" --max-time 20 https://xbed.xuanjian.top/
