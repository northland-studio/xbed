#!/bin/bash
# 在 115.190.153.44 上执行：备份当前 bedwars，重置为 zip 初始态 + XBedSync
set -e
APP=/opt/bedwars
TS=$(date +%Y%m%d-%H%M%S)
BK=/opt/bedwars.pre-reset-$TS

echo "=== 1. 停止服务并完整备份当前目录 ==="
systemctl stop bedwars
sleep 3
echo -n "  当前目录大小: "; du -sh $APP | cut -f1
tar -czf /root/bedwars-pre-reset-$TS.tar.gz -C /opt bedwars
ls -lh /root/bedwars-pre-reset-$TS.tar.gz | awk '{print "  备份文件: "$9" ("$5")"}'

echo "=== 2. 移走旧目录 ==="
mv "$APP" "$BK"
echo "  旧目录已移到 $BK"

echo "=== 3. 从 zip 解压初始态 ==="
mkdir -p "$APP"
python3 - "$APP" <<'PY'
import sys, zipfile
dst = sys.argv[1]
z = zipfile.ZipFile('/root/xbed-bedwars.zip')
z.extractall(dst)
print('  解压条目:', len(z.namelist()))
PY
ls "$APP" | head -8
echo -n "  插件 jar 数: "; ls "$APP"/plugins/*.jar 2>/dev/null | wc -l

echo "=== 4. 安装 XBedSync（仅这一个插件，serverKey=s2）==="
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
ls -l "$APP/plugins/XBedSync.jar"

echo "=== 5. 服务器基础配置（保持 zip 默认 + 开 RCON 便于运维）==="
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
print('  RCON/端口配置已写入')
PY
grep -E 'server-port|online-mode|enable-rcon|rcon.port|max-players' "$APP/server.properties"
echo "xbedrcon2026" > /root/.bedwars-rcon-password
chmod 600 /root/.bedwars-rcon-password

echo "=== 6. 启动 ==="
systemctl start bedwars
sleep 40
systemctl is-active bedwars
echo "=== 7. 启动日志校验 ==="
journalctl -u bedwars --since '-1 min' --no-pager | grep -aiE 'Load done|XBedSync|MULTIARENA|Done \(|ERROR' | tail -12
