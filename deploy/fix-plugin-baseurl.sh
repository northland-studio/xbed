#!/bin/bash
set -e
F=/opt/xbed-bedwars/plugins/XBedSync/config.yml
python3 - "$F" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = re.sub(r'(?m)^apiBaseUrl:.*$', 'apiBaseUrl: "https://xbed.xuanjian.top/api"', s)
open(p, 'w', encoding='utf-8').write(s)
print('apiBaseUrl 已改为 https://xbed.xuanjian.top/api')
PY
grep -n 'apiBaseUrl' "$F"
systemctl restart xbed-bedwars
sleep 30
echo "=== 服务状态 ==="
systemctl is-active xbed-bedwars
echo "=== RCON ping 重测 ==="
cat > /root/ping2.cmd <<'EOF'
xbedsync ping
xbedsync status
EOF
python3 /root/rcon2.py < /root/ping2.cmd 2>&1 | head -25
