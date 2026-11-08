#!/bin/bash
# 189 S1 比赛服：重置为 zip 初始态，仅额外安装 XBedSync
set -e
APP=/opt/xbed-bedwars
TS=$(date +%Y%m%d-%H%M%S)

echo "=== 1. 备份当前状态并停止服务 ==="
systemctl stop xbed-bedwars
sleep 3
tar -czf /root/xbed-bedwars-pre-zip-$TS.tar.gz -C /opt xbed-bedwars
ls -lh /root/xbed-bedwars-pre-zip-$TS.tar.gz | awk '{print "  备份: "$9" ("$5")"}'
mv "$APP" "/opt/xbed-bedwars.pre-zip-$TS"

echo "=== 2. 从 zip 解压初始态 ==="
mkdir -p "$APP"
python3 - "$APP" <<'PY'
import sys, zipfile
dst = sys.argv[1]
z = zipfile.ZipFile('/root/xbed-bedwars.zip')
z.extractall(dst)
print('  解压条目:', len(z.namelist()))
PY
ls "$APP" | head -8
echo -n "  插件数: "; ls "$APP"/plugins/*.jar 2>/dev/null | wc -l
echo -n "  slime worlds: "; ls "$APP"/slime_worlds/*.slime 2>/dev/null | wc -l

echo "=== 3. 仅新增 XBedSync（serverKey=s1）==="
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
ls -l "$APP/plugins/XBedSync.jar" | awk '{print "  XBedSync: "$5" bytes"}'
echo -n "  当前插件数: "; ls "$APP"/plugins/*.jar 2>/dev/null | wc -l

echo "=== 4. 确认 server.properties 保持 zip 原样 ==="
grep -E 'server-port|online-mode|enable-rcon|max-players' "$APP/server.properties" || true

echo "=== 5. 启动 ==="
systemctl start xbed-bedwars
sleep 45
systemctl is-active xbed-bedwars
echo "=== 6. 校验 ==="
journalctl -u xbed-bedwars --since '-2 min' --no-pager 2>/dev/null | grep -ac 'Load done' | sed 's/^/  竞技场 Load done 行数: /'
journalctl -u xbed-bedwars --since '-2 min' --no-pager 2>/dev/null | grep -aE 'XBedSync|MULTIARENA|Done \(' | tail -6
ss -lntp 2>/dev/null | grep -E ':25565' | head -2
