#!/bin/bash
echo "=== 1. RCON 调用 /xbedsync ping ==="
cat > /root/ping.cmd <<'EOF'
xbedsync ping
xbedsync status
EOF
python3 /root/rcon2.py < /root/ping.cmd 2>&1 | head -20

echo
echo "=== 2. 插件日志（最近）==="
journalctl -u xbed-bedwars --since '-10 min' --no-pager 2>/dev/null | grep -iE 'xbedsync' | tail -10

echo
echo "=== 3. 队列目录 ==="
ls -la /opt/xbed-bedwars/plugins/XBedSync/queue/ 2>/dev/null | head -10 || echo "  空/不存在"
