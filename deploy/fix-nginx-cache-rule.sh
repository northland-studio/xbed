#!/bin/bash
set -e
P=/etc/nginx/sites-available/xbed.xuanjian.top
cp -a "$P" "$P.bak-cache-$(date +%Y%m%d-%H%M%S)"
python3 - "$P" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
bad = '        add_header Cache-Control  no-cache must-revalidate;\n'
good = '        add_header Cache-Control "no-cache, must-revalidate" always;\n'
n = s.count(bad)
s = s.replace(bad, good)
open(p, 'w', encoding='utf-8').write(s)
print(f'修复 {n} 处 Cache-Control 引号')
PY
nginx -t 2>&1 | tail -2
systemctl reload nginx
echo "=== 验证 ==="
curl -s -I -H 'Host: xbed.xuanjian.top' http://127.0.0.1/ | grep -iE 'cache-control|content-type' | head -3
curl -s -o /dev/null -w "  首页 -> %{http_code}\n" -H 'Host: xbed.xuanjian.top' http://127.0.0.1/
