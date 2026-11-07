#!/bin/bash
set -e
echo "=== certbot 与 cloudflare 插件 ==="
which certbot || true
certbot plugins 2>/dev/null | grep -i cloudflare || echo "  未安装 cloudflare 插件"

echo "=== 签发证书（DNS-01）==="
mkdir -p /etc/letsencrypt
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d xbed.xuanjian.top \
  --non-interactive --agree-tos \
  -m "morzane_work@foxmail.com" \
  --deploy-hook "systemctl reload nginx" 2>&1 | tail -12

echo "=== 证书文件 ==="
ls -l /etc/letsencrypt/live/xbed.xuanjian.top/ 2>/dev/null | head -6
