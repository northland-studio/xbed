#!/bin/bash
set -e
P=/etc/nginx/sites-available/xbed.xuanjian.top
cp -a "$P" "$P.bak-cache2-$(date +%Y%m%d-%H%M%S)"
python3 - "$P" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()

# 删除之前多余的 = /index.html 块（由 location / 统一处理）
s = re.sub(r'\n    location = /index\.html \{\n[^}]*\}\n', '\n', s)

# 给所有 location / { ... } 块加 no-cache（SPA 入口 HTML 不缓存，静态资源仍有 30d/immutable）
def add_header(m):
    block = m.group(0)
    if 'Cache-Control' in block:
        return block
    return block.replace('    location / {\n', '    location / {\n        add_header Cache-Control "no-cache, must-revalidate" always;\n')

s = re.sub(r'    location / \{\n(?:.*?\n)*?    \}\n', add_header, s)
open(p, 'w', encoding='utf-8').write(s)
print('已为 location / 增加 no-cache')
PY
nginx -t 2>&1 | tail -2
systemctl reload nginx
echo "=== 验证 ==="
for path in / /index.html /assets/; do
  echo -n "  $path -> "
  curl -s -I -H 'Host: xbed.xuanjian.top' "http://127.0.0.1$path" | grep -iE '^(HTTP/|Cache-Control)' | tr '\n' ' '
  echo
done
