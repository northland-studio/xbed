#!/bin/bash
set -e
APP=/opt/xbed-bedwars
TS=$(date +%Y%m%d-%H%M%S)
UUID=2bcf62c5-071f-36a4-a391-6442b8ba261b

echo "=== 1. 备份 ==="
cp -a "$APP/server.properties" "$APP/server.properties.bak-op-$TS"
cp -a "$APP/ops.json" "$APP/ops.json.bak-op-$TS"
echo "  server.properties / ops.json 已备份（.bak-op-$TS）"
echo -n "  原 ops.json 内容: "; cat "$APP/ops.json"; echo

echo "=== 2. 开启 RCON ==="
python3 - "$APP/server.properties" <<'PY'
import sys
p = sys.argv[1]
lines = open(p, encoding='utf-8', errors='ignore').read().splitlines()
want = {'enable-rcon': 'true', 'rcon.port': '25575', 'rcon.password': 'xbedrcon2026', 'broadcast-rcon-to-ops': 'true'}
out, seen = [], set()
for line in lines:
    k = line.split('=', 1)[0]
    if k in want:
        out.append(f'{k}={want[k]}'); seen.add(k)
    else:
        out.append(line)
for k, v in want.items():
    if k not in seen:
        out.append(f'{k}={v}')
open(p, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('  RCON 已写入')
PY
grep -E 'enable-rcon|rcon.port|broadcast-rcon-to-ops' "$APP/server.properties"
echo 'xbedrcon2026' > /root/.xbed-rcon-password; chmod 600 /root/.xbed-rcon-password

echo "=== 3. 给 Morzane123 加 OP（ops.json）==="
python3 - "$APP/ops.json" "$UUID" <<'PY'
import json, sys
p, uuid = sys.argv[1], sys.argv[2]
data = []
try:
    data = json.load(open(p, encoding='utf-8'))
except Exception:
    data = []
if not any(item.get('uuid') == uuid for item in data):
    data.append({"uuid": uuid, "name": "Morzane123", "level": 4, "bypassesPlayerLimit": False})
    json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('  已添加 OP 条目')
else:
    print('  已存在 OP 条目，跳过')
PY
cat "$APP/ops.json"; echo

echo "=== 4. 重启 ==="
systemctl restart xbed-bedwars
sleep 45
systemctl is-active xbed-bedwars
ss -lntp 2>/dev/null | grep -E ':25565|:25575'
