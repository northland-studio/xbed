#!/bin/bash
set -e
APP=/var/www/xbed
cat > $APP/ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [{
    name: 'xbed-api',
    cwd: '/var/www/xbed/api',
    script: 'dist/index.js',
    interpreter: '/usr/bin/node',
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
pm2 delete xbed-api >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save >/dev/null
sleep 6
echo "=== 健康检查 ==="
curl -s --max-time 10 http://127.0.0.1:3939/api/health; echo
echo "=== 公开接口 ==="
curl -s --max-time 10 http://127.0.0.1:3939/api/stats/overview | head -c 400; echo
curl -s --max-time 10 http://127.0.0.1:3939/api/seasons | head -c 300; echo
echo "=== pm2 ==="
pm2 status xbed-api | head -8
echo "=== 日志尾部 ==="
tail -10 $APP/logs/api-error.log 2>/dev/null
