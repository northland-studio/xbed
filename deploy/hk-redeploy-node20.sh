#!/bin/bash
set -e
APP=/var/www/xbed
cd $APP/api

echo "=== 用 Node 20 重装依赖 ==="
export PATH=/usr/bin:$PATH
rm -rf node_modules
/usr/bin/npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3
echo "=== 校验原生模块 ==="
/usr/bin/node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); db.exec('create table t(a)'); console.log('better-sqlite3 OK on', process.version)"

echo "=== 数据库迁移与初始化 ==="
/usr/bin/node dist/db/migrate.js
/usr/bin/node dist/db/seed.js

echo "=== 更新 pm2 配置（Node 20）==="
python3 - <<'PY'
p = '/var/www/xbed/ecosystem.config.cjs'
s = open(p).read()
s = s.replace("interpreter: '/opt/node22/bin/node'", "interpreter: '/usr/bin/node'")
open(p, 'w').write(s)
print('  ecosystem 已切换到 /usr/bin/node')
PY

cd $APP
if pm2 describe xbed-api >/dev/null 2>&1; then
  pm2 delete xbed-api >/dev/null
fi
pm2 start ecosystem.config.cjs
pm2 save >/dev/null
sleep 5
echo "=== 健康检查 ==="
curl -s --max-time 10 http://127.0.0.1:3939/api/health; echo
echo "=== 概况接口 ==="
curl -s --max-time 10 http://127.0.0.1:3939/api/stats/overview | head -c 400; echo
echo "=== pm2 ==="
pm2 status xbed-api | head -6
