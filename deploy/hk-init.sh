#!/bin/bash
# 在 HK 上执行：初始化 XBed 目录、写生产 .env、安装依赖、迁移、启动 pm2
set -e
APP=/var/www/xbed
mkdir -p $APP/{api,web,data/files,logs,backup}

if [ ! -f $APP/api/.env ]; then
  echo "=== 生成生产 .env ==="
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  cat > $APP/api/.env <<EOF
NODE_ENV=production
PORT=3939
PUBLIC_ORIGIN=https://xbed.xuanjian.top
DB_FILE=$APP/data/xbed.db
FILES_DIR=$APP/data/files
SESSION_SECRET=$SESSION_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
SESSION_TTL_DAYS=7
COOKIE_SECURE=true
TRUST_PROXY=true
XUANJIAN_PROVIDER_URL=https://www.xuanjian.top
XUANJIAN_CLIENT_ID=xbed
XUANJIAN_CLIENT_SECRET=xj_cwYBG8IP1aSX6rwi9eFaFbTwGmxXI4h0zWwxEbknCw8
XUANJIAN_REDIRECT_URI=https://xbed.xuanjian.top/api/auth/callback
XUANJIAN_SCOPE=read:user read:member
SMTP_HOST=smtp.exmail.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@xuanjian.top
SMTP_PASS=
SMTP_FROM_NAME=XBed 赛事平台
SMTP_FROM_EMAIL=noreply@xuanjian.top
EVIDENCE_DEADLINE_MINUTES=60
APPEAL_DEADLINE_HOURS=48
UPLOAD_MAX_LOG_MB=20
UPLOAD_MAX_MCPR_MB=300
EOF
  chmod 600 $APP/api/.env
  echo "  .env 已生成（600）"
else
  echo "  .env 已存在，跳过"
fi

echo "=== 目录权限 ==="
chmod 700 $APP/data
ls -ld $APP $APP/api $APP/data $APP/data/files $APP/logs
