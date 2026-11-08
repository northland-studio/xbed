#!/bin/bash
set -e

echo "=== 1. FairFight：关闭 badpacket 的处罚（保留告警）==="
FF=/opt/xbed-bedwars/plugins/FairFight/checks.yml
cp -a "$FF" "$FF.bak-$(date +%Y%m%d-%H%M%S)"
python3 - "$FF" <<'PY'
import re, sys
path = sys.argv[1]
lines = open(path, encoding='utf-8').read().split('\n')
out = []
in_block = False
changed = 0
for line in lines:
    if re.match(r'^[a-zA-Z_]+:', line):
        in_block = line.strip() == 'badpacket:'
    if in_block and re.match(r'^\s+punishable:\s*true', line):
        indent = line[:len(line) - len(line.lstrip())]
        out.append(f'{indent}punishable: false')
        changed += 1
        continue
    out.append(line)
open(path, 'w', encoding='utf-8').write('\n'.join(out))
print(f'  badpacket punishable: true -> false，共 {changed} 处')
PY

echo "=== 2. STN-Studios：MOTD 恢复为 3 行（修 ArrayIndexOutOfBounds 报错）==="
STN=/opt/xbed-bedwars/plugins/STN-Studios/config.yml
cp -a "$STN" "$STN.bak-$(date +%Y%m%d-%H%M%S)"
python3 - "$STN" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
lines = [
    "&6&lX&e&lB&a&le&b&ld &f&l起床战争挑战赛&c&l正式服",
    "&7XBed 挑战赛 &8| &b一个账号 贯穿所有系统 &8| &exuanjian.top",
    "&7报名地址 &fhttps://xbed.xuanjian.top",
]
block = "      LINES:\n" + "".join(f"        - '{l}'\n" for l in lines) + "      MAX_PLAYERS: 60"
s2, n = re.subn(r"      LINES:\n(?:        - '.*?'\n)+      MAX_PLAYERS: \d+", block, s, flags=re.S)
if n == 0:
    print('  未匹配到 LINES，跳过')
else:
    open(p, 'w', encoding='utf-8').write(s2)
    print(f'  MOTD 已恢复 3 行（{n} 处）')
PY

echo "=== 3. 重启服务器 ==="
systemctl restart xbed-bedwars
sleep 32
systemctl is-active xbed-bedwars
echo "=== 4. 日志检查（FairFight / STN / 错误）==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -iE 'fairfight|STN-Studios|ArrayIndex|enabling' | tail -12
echo "=== 5. 当前配置确认 ==="
grep -A2 '^badpacket:' "$FF" | head -4
grep -A4 'LINES:' "$STN" | head -6
