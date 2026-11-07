#!/bin/bash
# XBed 一键部署到 HK（64.90.13.2）
# 用法：在本地 PowerShell 中执行
#   bash deploy/deploy-to-hk.sh
# 前置：本地已构建 apps/web/dist 与 apps/api/dist；HK 上已存在 /var/www/xbed
set -euo pipefail

HK=hk
APP=/var/www/xbed
LOCAL=$(cd "$(dirname "$0")/.." && pwd)

echo "=== 1. 服务器目录准备 ==="
ssh "$HK" "mkdir -p $APP/{api,web,data/files,logs,backup} && ls -ld $APP"

echo "=== 2. 上传 API 代码与依赖 ==="
rsync -az --delete "$LOCAL/apps/api/dist/" "$HK:$APP/api/dist/"
rsync -az "$LOCAL/apps/api/package.json" "$HK:$APP/api/"
rsync -az "$LOCAL/apps/api/db/" "$HK:$APP/api/db/"
# 生产 .env 首次需手动放置，避免覆盖
if ! ssh "$HK" "test -f $APP/api/.env"; then
  echo "  ⚠ 生产 .env 不存在，请先创建 $APP/api/.env（参考 apps/api/.env.example）"
fi

echo "=== 3. 安装生产依赖 ==="
ssh "$HK" "cd $APP/api && npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3"

echo "=== 4. 数据库迁移与初始化（幂等）==="
ssh "$HK" "cd $APP/api && node dist/db/migrate.js && node dist/db/seed.js"

echo "=== 5. 上传前端构建产物 ==="
rsync -az --delete "$LOCAL/apps/web/dist/" "$HK:$APP/web/"

echo "=== 6. 启动/重启 API ==="
scp -q "$LOCAL/deploy/ecosystem.config.cjs" "$HK:$APP/ecosystem.config.cjs"
ssh "$HK" "cd $APP && (pm2 describe xbed-api >/dev/null 2>&1 && pm2 restart xbed-api --update-env || pm2 start ecosystem.config.cjs) && pm2 save"

echo "=== 7. nginx 站点 ==="
scp -q "$LOCAL/deploy/nginx-xbed.conf" "$HK:/etc/nginx/sites-available/xbed.xuanjian.top"
ssh "$HK" "ln -sf /etc/nginx/sites-available/xbed.xuanjian.top /etc/nginx/sites-enabled/xbed.xuanjian.top && nginx -t && systemctl reload nginx"

echo "=== 8. 健康检查 ==="
sleep 3
ssh "$HK" "curl -s --max-time 10 http://127.0.0.1:3939/api/health; echo"

echo "=== 完成。若首次部署还需：DNS 记录 + certbot 证书（见 docs/DEPLOY.md）==="
