#!/bin/bash
# 仅修改 TAB 与 MOTD，其他一律不动
set -e
CUR=/opt/xbed-bedwars
PRE=$(ls -d /opt/xbed-bedwars.pre-zip-* 2>/dev/null | tail -1)
TS=$(date +%Y%m%d-%H%M%S)

echo "=== 1. 备份将被修改的文件 ==="
cp -a "$CUR/plugins/TAB/config.yml" "$CUR/plugins/TAB/config.yml.bak-zip-$TS"
cp -a "$CUR/plugins/STN-Studios/config.yml" "$CUR/plugins/STN-Studios/config.yml.bak-zip-$TS"
cp -a "$CUR/server.properties" "$CUR/server.properties.bak-zip-$TS"
echo "  已备份 3 个文件（.bak-zip-$TS）"

echo "=== 2. TAB 换成我们的配置 ==="
cp -f "$PRE/plugins/TAB/config.yml" "$CUR/plugins/TAB/config.yml"
grep -A5 '^header:' "$CUR/plugins/TAB/config.yml" | head -6

echo "=== 3. MOTD 换成我们的（STN LINES + server.properties motd）==="
python3 - "$CUR/plugins/STN-Studios/config.yml" "$CUR/server.properties" "$PRE/server.properties" <<'PY'
import re, sys
stn, props, pre_props = sys.argv[1], sys.argv[2], sys.argv[3]

lines = [
    "&6&lX&e&lB&a&le&b&ld &f&l起床战争挑战赛&c&l正式服",
    "&7XBed 挑战赛 &8| &b一个账号 贯穿所有系统 &8| &exuanjian.top",
    "&7报名地址 &fhttps://xbed.xuanjian.top",
]
block = "      LINES:\n" + "".join(f"        - '{l}'\n" for l in lines) + "      MAX_PLAYERS: 60"
s = open(stn, encoding='utf-8').read()
s2, n = re.subn(r"      LINES:\n(?:        - '.*?'\n)+      MAX_PLAYERS: \d+", block, s, flags=re.S)
if n:
    open(stn, 'w', encoding='utf-8').write(s2)
print(f"  STN MOTD 已替换（{n} 处）")

# server.properties 的 motd 用备份里的 XBed 版本
pre = open(pre_props, encoding='utf-8', errors='ignore').read().splitlines()
motd_line = next((l for l in pre if l.startswith('motd=')), None)
if motd_line:
    cur = open(props, encoding='utf-8', errors='ignore').read().splitlines()
    out = [motd_line if l.startswith('motd=') else l for l in cur]
    if not any(l.startswith('motd=') for l in cur):
        out.append(motd_line)
    open(props, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print("  server.properties motd 已替换")
else:
    print("  ⚠ 备份中未找到 motd 行")
PY
echo -n "  当前 server.properties motd: "; grep '^motd=' "$CUR/server.properties" | cut -c1-80

echo "=== 4. 重启 ==="
systemctl restart xbed-bedwars
sleep 45
systemctl is-active xbed-bedwars
echo "=== 5. 校验 ==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager 2>/dev/null | grep -aiE 'TAB|Load done|Done \(' | tail -8
