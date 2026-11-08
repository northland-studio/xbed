#!/bin/bash
echo "=== BedWars 语言文件中的命令键 ==="
grep -oE '^[a-zA-Z0-9_-]*cmd[a-zA-Z0-9_-]*' /opt/xbed-bedwars/plugins/BedWars1058/Languages/messages_zh.yml 2>/dev/null | sed 's/^/  /' | head -40

echo
echo "=== 当前在线人数（从日志最后登录/退出推断）==="
tail -200 /opt/xbed-bedwars/logs/latest.log 2>/dev/null | grep -E 'logged in|joined the game|left the game|lost connection' | tail -15

echo
echo "=== 最近是否有玩家加入竞技场（日志）==="
for f in /opt/xbed-bedwars/logs/latest.log /opt/xbed-bedwars/logs/2026-11-07-7.log.gz; do
  case "$f" in *.gz) zcat "$f" 2>/dev/null;; *) cat "$f" 2>/dev/null;; esac | grep -iE 'arena|joined|spectat|team|waiting|starting' | tail -15
done

echo
echo "=== RCON: 尝试常用命令 ==="
cat > /root/bw2.cmd <<'EOF'
bw help
bw arena list
bw arenas list
bw stats
list
EOF
python3 /root/rcon2.py < /root/bw2.cmd 2>&1 | head -40
