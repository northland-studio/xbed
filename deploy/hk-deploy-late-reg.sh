#!/bin/bash
set -e
APP=/var/www/xbed
echo "=== 后端 ==="
cd $APP/api
rm -rf dist.tmp && mkdir dist.tmp
tar -xzf /root/api4.tgz -C dist.tmp
rm -rf dist && mv dist.tmp/dist dist
rm -rf dist.tmp
pm2 restart xbed-api --update-env >/dev/null
sleep 5
curl -s --max-time 8 http://127.0.0.1:3939/api/health; echo

echo "=== 前端 ==="
rm -rf $APP/web.tmp && mkdir -p $APP/web.tmp
tar -xzf /root/web4.tgz -C $APP/web.tmp
rm -rf $APP/web && mv $APP/web.tmp/dist $APP/web
rm -rf $APP/web.tmp
ls -la $APP/web | head -5

echo "=== nginx ==="
nginx -t 2>&1 | tail -1
systemctl reload nginx

echo "=== 线上验证 ==="
curl -s -o /dev/null -w "  前端首页 -> %{http_code}\n" --max-time 10 http://127.0.0.1/
curl -s --max-time 10 http://127.0.0.1:3939/api/seasons/1 | head -c 300; echo
