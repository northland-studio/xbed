#!/bin/bash
# 115 服务器：恢复到重置前的原始状态，仅额外安装 XBedSync
set -e
APP=/opt/bedwars
BK=/opt/bedwars.pre-reset-20261108-101941

echo "=== 1. 停止服务 ==="
systemctl stop bedwars
sleep 3

echo "=== 2. 移走当前（zip 初始态）目录 ==="
mv "$APP" "/opt/bedwars.zipstate-$(date +%Y%m%d-%H%M%S)"

echo "=== 3. 恢复重置前原始目录 ==="
if [ -d "$BK" ]; then
  mv "$BK" "$APP"
  echo "  已恢复: $APP"
else
  echo "  ⚠ 备份目录不存在，尝试解包 tar"
  tar -xzf /root/bedwars-pre-reset-20261108-101941.tar.gz -C /opt
fi
ls "$APP" | head -8
echo -n "  插件数: "; ls "$APP"/plugins/*.jar 2>/dev/null | wc -l
echo -n "  slime worlds: "; ls "$APP"/slime_worlds/*.slime 2>/dev/null | wc -l

echo "=== 4. 仅新增 XBedSync（不改其他任何配置）==="
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
ls -l "$APP/plugins/XBedSync.jar" | awk '{print "  XBedSync: "$5" bytes"}'
echo -n "  当前插件数: "; ls "$APP"/plugins/*.jar 2>/dev/null | wc -l

echo "=== 5. 启动 ==="
systemctl start bedwars
sleep 45
systemctl is-active bedwars
echo "=== 6. 校验 ==="
journalctl -u bedwars --since '-1 min' --no-pager 2>/dev/null | grep -ac 'Load done' | sed 's/^/  竞技场 Load done 行数: /'
journalctl -u bedwars --since '-2 min' --no-pager 2>/dev/null | grep -aE 'XBedSync|MULTIARENA|Done \(' | tail -6
ss -lntp 2>/dev/null | grep -E ':25565' | head -2
