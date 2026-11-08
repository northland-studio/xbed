#!/bin/bash
echo "=== 竞技场 minPlayers / group 分布 ==="
for f in /opt/xbed-bedwars/plugins/BedWars1058/Arenas/*.yml; do
  case "$f" in *bak*) continue;; esac
  base=$(basename "$f" .yml)
  case "$base" in *-*) continue;; esac
  mp=$(grep -m1 -E '^minPlayers:' "$f" | cut -d: -f2 | tr -d ' ')
  gr=$(grep -m1 -E '^group:' "$f" | cut -d: -f2 | tr -d ' ')
  mx=$(grep -m1 -E '^maxInTeam:' "$f" | cut -d: -f2 | tr -d ' ')
  echo "  $base | group=$gr minPlayers=$mp maxInTeam=$mx"
done

echo
echo "=== 启动时竞技场加载结果 ==="
grep -E 'Load done|Loaded arena|arena.*loaded|disabled' /opt/xbed-bedwars/logs/latest.log 2>/dev/null | tail -20

echo
echo "=== BedWars1058 config 里与开局相关的项 ==="
grep -nE 'minPlayers|countdown|startDelay|joinDelay|maxInTeam|allowSpectate|noConc|bungee|fastJoin' /opt/xbed-bedwars/plugins/BedWars1058/config.yml 2>/dev/null | head -20

echo
echo "=== 用 RCON 查询命令与竞技场 ==="
cat > /root/bw.cmd <<'EOF'
bw
bw arenas
bw list
EOF
python3 /root/rcon2.py < /root/bw.cmd 2>&1 | head -40
