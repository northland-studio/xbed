#!/bin/bash
set -e
A=/opt/xbed-bedwars/plugins/BedWars1058/Arenas
BK=/opt/xbed-bedwars/plugins/BedWars1058/Arenas.bak-minplayers-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BK"
cp -a "$A"/*.yml "$BK"/ 2>/dev/null || true
echo "=== 备份到 $BK ==="
ls "$BK" | wc -l

echo "=== 测试期：所有竞技场 minPlayers 降为 2（2 人即可开任何图）==="
python3 - "$A" <<'PY'
import glob, os, re, sys
d = sys.argv[1]
changed = 0
for path in glob.glob(os.path.join(d, '*.yml')):
    base = os.path.basename(path)
    if '-multi-' in base or base.startswith('.'):
        continue
    s = open(path, encoding='utf-8').read()
    s2, n = re.subn(r'(?m)^minPlayers:\s*\d+\s*$', 'minPlayers: 2', s)
    if n:
        open(path, 'w', encoding='utf-8').write(s2)
        changed += 1
print(f'  修改了 {changed} 个竞技场文件')
PY

echo "=== 抽样确认 ==="
grep -H '^minPlayers:' "$A"/sky.yml "$A"/before.yml "$A"/castle.yml "$A"/blossom.yml 2>/dev/null

echo "=== 重启服务器 ==="
systemctl restart xbed-bedwars
sleep 32
systemctl is-active xbed-bedwars
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -acE 'Load done' | head -1
