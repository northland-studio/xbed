#!/bin/bash
set -e
ROOT=/opt
APP=/opt/xbed-bedwars
TS=$(date +%Y%m%d-%H%M%S)
BK=/opt/xbed-bedwars.bak-$TS

echo "=== 1. 记录当前状态并备份（完整目录改名保留，可随时回滚）==="
systemctl stop xbed-bedwars
sleep 3
mv "$APP" "$BK"
echo "  当前状态已备份到 $BK"

echo "=== 2. 从原始 zip 解压 ==="
mkdir -p "$APP"
python3 - "$APP" <<'PY'
import sys, zipfile
dst = sys.argv[1]
z = zipfile.ZipFile('/root/xbed-bedwars.zip')
z.extractall(dst)
print('  解压条目:', len(z.namelist()))
PY
echo "  解压完成，顶层内容："
ls -la "$APP" | head -12

echo "=== 3. 仅叠加 XBedSync 插件 ==="
cp -f /root/XBedSync-1.0.1.jar "$APP/plugins/XBedSync.jar"
mkdir -p "$APP/plugins/XBedSync"
cat > "$APP/plugins/XBedSync/config.yml" <<'EOF'
# XBedSync 配置
apiBaseUrl: "https://xbed.xuanjian.top/api"
serverKey: "s1"
hmacSecret: "854593b35b4a09cb37b776d9b1fbc0b67e5185dd0f1e568910da796af543ade0"

modeAllowlist: []
arenaAllowlist: []

queueDir: "/opt/xbed-bedwars/plugins/XBedSync/queue"
requestTimeoutSeconds: 15
retry:
  initialDelaySeconds: 1
  maxDelaySeconds: 300
  maxAttempts: 0
debug: false
EOF
chmod 600 "$APP/plugins/XBedSync/config.yml"
ls -l "$APP/plugins/XBedSync.jar"

echo "=== 4. 打开 RCON（唯一必要的运维改动，便于命令控制）==="
RCON_PASS=$(cat /root/.xbed-rcon-password 2>/dev/null || echo "xbedrcon2026")
python3 - "$APP/server.properties" "$RCON_PASS" <<'PY'
import sys
p, pw = sys.argv[1], sys.argv[2]
lines = open(p, encoding='utf-8', errors='ignore').read().splitlines()
out = []
seen = set()
for line in lines:
    k = line.split('=')[0]
    if k == 'enable-rcon':
        out.append('enable-rcon=true'); seen.add(k)
    elif k == 'rcon.port':
        out.append('rcon.port=25575'); seen.add(k)
    elif k == 'rcon.password':
        out.append(f'rcon.password={pw}'); seen.add(k)
    else:
        out.append(line)
for k, v in [('enable-rcon','true'), ('rcon.port','25575'), ('rcon.password',pw)]:
    if k not in seen:
        out.append(f'{k}={v}')
open(p, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('  RCON 已启用')
PY
grep -E 'online-mode|enable-rcon|rcon.port|max-players|server-port' "$APP/server.properties"

echo "=== 5. 启动服务器 ==="
chmod +x "$APP"/*.jar 2>/dev/null || true
systemctl start xbed-bedwars
sleep 40
systemctl is-active xbed-bedwars
echo "=== 6. 启动结果 ==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -aiE 'Done \(|XBedSync|Load done|MULTIARENA|ERROR|TeamSelector' | tail -15
