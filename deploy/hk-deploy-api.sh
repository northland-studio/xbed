#!/bin/bash
set -e
APP=/var/www/xbed
NODE=/opt/node22/bin/node
NPM=/opt/node22/bin/npm

echo "=== 解包 ==="
rm -rf $APP/api.tmp && mkdir -p $APP/api.tmp
tar -xzf /root/api.tgz -C $APP/api.tmp
mkdir -p $APP/api
cp -a $APP/api.tmp/dist $APP/api/
cp -a $APP/api.tmp/db $APP/api/ 2>/dev/null || true
cp -f $APP/api.tmp/package.json $APP/api/
rm -rf $APP/api.tmp

rm -rf $APP/web.tmp && mkdir -p $APP/web.tmp
tar -xzf /root/web.tgz -C $APP/web.tmp
rm -rf $APP/web && mv $APP/web.tmp/dist $APP/web
rm -rf $APP/web.tmp

echo "=== 安装生产依赖 (Node 22) ==="
cd $APP/api
$NPM install --omit=dev --no-audit --no-fund 2>&1 | tail -4

echo "=== 数据库迁移与初始化 ==="
cd $APP/api
$NODE dist/db/migrate.js
$NODE dist/db/seed.js

echo "=== 启动 pm2 ==="
cat > $APP/ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [{
    name: 'xbed-api',
    cwd: '/var/www/xbed/api',
    script: 'dist/index.js',
    interpreter: '/opt/node22/bin/node',
    interpreter_args: '--max-old-space-size=320',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 20,
    min_uptime: '10s',
    restart_delay: 3000,
    max_memory_restart: '450M',
    env: { NODE_ENV: 'production', PORT: '3939' },
    out_file: '/var/www/xbed/logs/api-out.log',
    error_file: '/var/www/xbed/logs/api-error.log',
    merge_logs: true,
    time: true
  }]
};
EOF
cd $APP
if pm2 describe xbed-api >/dev/null 2>&1; then
  pm2 restart xbed-api --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save >/dev/null
sleep 4
echo "=== 健康检查 ==="
curl -s --max-time 10 http://127.0.0.1:3939/api/health || echo "(健康检查失败)"
echo
pm2 status xbed-api | head -8
