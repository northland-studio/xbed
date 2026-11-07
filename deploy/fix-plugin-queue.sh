#!/bin/bash
set -e
F=/opt/xbed-bedwars/plugins/XBedSync/config.yml
python3 - "$F" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = re.sub(r'(?m)^queueDir:.*$', 'queueDir: "/opt/xbed-bedwars/plugins/XBedSync/queue"', s)
open(p, 'w', encoding='utf-8').write(s)
print('queueDir 已改为绝对路径')
PY
grep -n 'queueDir' "$F"
rm -rf /opt/xbed-bedwars/plugins/XBedSync/plugins
systemctl restart xbed-bedwars
sleep 30
systemctl is-active xbed-bedwars
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -i xbedsync | tail -3
