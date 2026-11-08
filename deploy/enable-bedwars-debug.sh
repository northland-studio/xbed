#!/bin/bash
set -e
C=/opt/xbed-bedwars/plugins/BedWars1058/config.yml
cp -a "$C" "$C.bak-$(date +%Y%m%d-%H%M%S)"
python3 - "$C" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s2, n = re.subn(r'(?m)^debug: false\s*$', 'debug: true', s)
if n == 0:
    print('  未找到 debug: false')
else:
    open(p, 'w', encoding='utf-8').write(s2)
    print(f'  debug 已开启（{n} 处）')
PY
grep -n '^debug:' "$C"

echo "=== 重启服务器 ==="
systemctl restart xbed-bedwars
sleep 34
systemctl is-active xbed-bedwars
echo "=== 启动后日志（debug 生效检查）==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -aiE 'debug|Load done: sky|MULTIARENA' | tail -8
