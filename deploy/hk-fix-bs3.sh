#!/bin/bash
set -e
APP=/var/www/xbed
cd $APP/api
echo "=== 当前 package.json 依赖 ==="
grep -A2 '"dependencies"' package.json | head -4
grep 'better-sqlite3' package.json

echo "=== 强制安装 11.10.0 ==="
/usr/bin/npm install better-sqlite3@11.10.0 --omit=dev --no-audit --no-fund 2>&1 | tail -3
echo "=== 版本与加载测试 ==="
node -e "console.log('bs3 version:', require('better-sqlite3/package.json').version)"
/usr/bin/node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); db.exec('create table t(a)'); db.prepare('insert into t values (1)').run(); console.log('LOAD OK on', process.version, JSON.stringify(db.prepare('select count(*) c from t').get()))"

echo "=== 迁移与 seed ==="
/usr/bin/node dist/db/migrate.js
/usr/bin/node dist/db/seed.js

echo "=== 重启 pm2 ==="
cd $APP
pm2 delete xbed-api >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save >/dev/null
sleep 5
echo "=== 健康检查 ==="
curl -s --max-time 10 http://127.0.0.1:3939/api/health; echo
curl -s --max-time 10 http://127.0.0.1:3939/api/stats/overview | head -c 300; echo
pm2 status xbed-api | head -6
