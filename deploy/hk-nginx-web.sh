#!/bin/bash
set -e
APP=/var/www/xbed

echo "=== 解包最新前端 ==="
rm -rf $APP/web.tmp && mkdir -p $APP/web.tmp
tar -xzf /root/web2.tgz -C $APP/web.tmp
rm -rf $APP/web && mv $APP/web.tmp/dist $APP/web
rm -rf $APP/web.tmp
ls -la $APP/web | head -6

echo "=== 写入 nginx 配置（先 HTTP，证书后补）==="
cat > /etc/nginx/sites-available/xbed.xuanjian.top <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name xbed.xuanjian.top;

    root /var/www/xbed/web;
    index index.html;

    client_max_body_size 320m;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3939;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 320m;
        proxy_request_buffering off;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    access_log /var/www/xbed/logs/nginx-access.log;
    error_log  /var/www/xbed/logs/nginx-error.log warn;
}
EOF

ln -sf /etc/nginx/sites-available/xbed.xuanjian.top /etc/nginx/sites-enabled/xbed.xuanjian.top
nginx -t 2>&1 | tail -2
systemctl reload nginx
sleep 2

echo "=== 通过 Host 头本地验证 ==="
curl -s -o /dev/null -w "  首页 HTTP %{http_code}\n" -H "Host: xbed.xuanjian.top" http://127.0.0.1/
curl -s -H "Host: xbed.xuanjian.top" http://127.0.0.1/ | head -c 200; echo
curl -s -H "Host: xbed.xuanjian.top" http://127.0.0.1/api/health; echo
