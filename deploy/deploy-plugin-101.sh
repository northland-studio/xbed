#!/bin/bash
set -e
APP=/opt/xbed-bedwars
echo "=== 替换插件为 1.0.1 ==="
cp -f /root/XBedSync-1.0.1.jar "$APP/plugins/XBedSync.jar"
ls -l "$APP/plugins/XBedSync.jar"
systemctl restart xbed-bedwars
sleep 32
echo "=== 服务状态 ==="
systemctl is-active xbed-bedwars
echo "=== 插件版本日志 ==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -iE 'xbedsync' | tail -5
echo "=== RCON ping ==="
cat > /root/ping3.cmd <<'EOF'
xbedsync ping
EOF
python3 /root/rcon2.py < /root/ping3.cmd 2>&1 | head -10
sleep 6
echo "=== 插件控制台响应 ==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -iE 'xbedsync|ingest' | tail -8
