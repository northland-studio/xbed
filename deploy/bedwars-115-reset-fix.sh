#!/bin/bash
set -e
APP=/opt/bedwars
echo "=== 1. 修正解压层级（zip 内有一层中文目录）==="
INNER=$(find "$APP" -maxdepth 1 -mindepth 1 -type d | head -1)
echo "  内层目录: $INNER"
shopt -s dotglob
mv "$INNER"/* "$APP"/
rmdir "$INNER"
shopt -u dotglob
ls "$APP" | head -10
echo -n "  插件 jar 数: "; ls "$APP"/plugins/*.jar 2>/dev/null | wc -l
echo -n "  slime worlds: "; ls "$APP"/slime_worlds/*.slime 2>/dev/null | wc -l

echo "=== 2. 安装 XBedSync（serverKey=s2）==="
cp -f /root/XBedSync-1.0.1.jar "$APP/plugins/XBedSync.jar"
mkdir -p "$APP/plugins/XBedSync"
cat > "$APP/plugins/XBedSync/config.yml" <<'EOF'
# XBedSync 配置
apiBaseUrl: "https://xbed.xuanjian.top/api"
serverKey: "s2"
hmacSecret: "e551002094a1d468e4d587b56ff391af214dd0de8c3488bf53fdb9a35fd50e03"

modeAllowlist: []
arenaAllowlist: []

queueDir: "/opt/bedwars/plugins/XBedSync/queue"
requestTimeoutSeconds: 15
retry:
  initialDelaySeconds: 1
  maxDelaySeconds: 300
  maxAttempts: 0
debug: false
EOF
chmod 600 "$APP/plugins/XBedSync/config.yml"
ls -l "$APP/plugins/XBedSync.jar" | awk '{print "  "$9" "$5" bytes"}'

echo "=== 3. 基础配置（zip 默认 + RCON）==="
python3 - "$APP/server.properties" <<'PY'
import sys
p = sys.argv[1]
lines = open(p, encoding='utf-8', errors='ignore').read().splitlines()
want = {
    'online-mode': 'false',
    'server-port': '25565',
    'enable-rcon': 'true',
    'rcon.port': '25575',
    'rcon.password': 'xbedrcon2026',
    'max-players': '50',
}
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
print('  已写入')
PY
grep -E 'server-port|online-mode|enable-rcon|rcon.port|max-players' "$APP/server.properties"
echo "xbedrcon2026" > /root/.bedwars-rcon-password; chmod 600 /root/.bedwars-rcon-password

echo "=== 4. 启动 ==="
systemctl start bedwars
sleep 42
systemctl is-active bedwars
echo "=== 5. 校验 ==="
journalctl -u bedwars --since '-1 min' --no-pager | grep -aiE 'Load done|XBedSync|MULTIARENA|Done \(|ERROR\]' | tail -12
echo
ss -lntp 2>/dev/null | grep -E ':25565|:25575' | head -3
