#!/bin/bash
# 在 XBed 起床战争服务器（189.105.72.119）安装 XBedSync 插件
set -e
APP=/opt/xbed-bedwars
PLUG=$APP/plugins

echo "=== 1. 检查现有插件冲突 ==="
ls -1 "$PLUG" | grep -i xbedsync || echo "  （未安装过）"

echo "=== 2. 安装 jar ==="
cp -f /root/XBedSync-1.0.0.jar "$PLUG/XBedSync.jar"
ls -l "$PLUG/XBedSync.jar"

echo "=== 3. 写配置 ==="
mkdir -p "$PLUG/XBedSync"
cat > "$PLUG/XBedSync/config.yml" <<'EOF'
# XBedSync 配置
apiBaseUrl: "https://xbed.xuanjian.top"
serverKey: "s1"
hmacSecret: "854593b35b4a09cb37b776d9b1fbc0b67e5185dd0f1e568910da796af543ade0"

# 允许计入赛事的比赛模式（BedWars1058 的 arena group），留空 = 全部
modeAllowlist: []
# 允许计入赛事的地图（arena 文件名，不含 .yml），留空 = 全部
arenaAllowlist: []

queueDir: "plugins/XBedSync/queue"
requestTimeoutSeconds: 15
retry:
  initialDelaySeconds: 1
  maxDelaySeconds: 300
  maxAttempts: 0
debug: false
EOF
chmod 600 "$PLUG/XBedSync/config.yml"
echo "  配置已写入（apiBaseUrl=https://xbed.xuanjian.top, serverKey=s1）"

echo "=== 4. 重启服务器加载插件 ==="
systemctl restart xbed-bedwars
sleep 30
systemctl is-active xbed-bedwars
echo "=== 5. 插件加载日志 ==="
journalctl -u xbed-bedwars -n 500 --no-pager 2>/dev/null | grep -iE 'xbedsync' | tail -10
echo "=== 6. 队列目录 ==="
ls -la "$PLUG/XBedSync/" 2>/dev/null
