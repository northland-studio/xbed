#!/bin/bash
LOG=/opt/xbed-bedwars/logs/latest.log
echo "=== 最近 25 分钟日志（BedWars/竞技场/队伍/传送相关）==="
tail -2000 "$LOG" 2>/dev/null | grep -iaE 'arena|sky|team|join|leave|countdown|start|teleport|lobby|kick|error|warn' | tail -60
echo
echo "=== sky.yml 关键配置 ==="
sed -n '1,25p' /opt/xbed-bedwars/plugins/BedWars1058/Arenas/sky.yml 2>/dev/null
echo
echo "=== sky.yml 中队伍/出生点/是否有 team 配置 ==="
grep -nE 'team|spawn|waiting|spectator' /opt/xbed-bedwars/plugins/BedWars1058/Arenas/sky.yml 2>/dev/null | head -20
echo
echo "=== BedWars config 中队伍分配/倒计时 ==="
grep -nE 'team-assigner|assigner|countdown|start|minPlayers|waiting' /opt/xbed-bedwars/plugins/BedWars1058/config.yml | head -20
