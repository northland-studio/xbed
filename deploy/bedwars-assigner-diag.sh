#!/bin/bash
cd /opt/xbed-bedwars/plugins || exit 1
echo "=== assigner 相关配置 ==="
grep -rniE 'assigner|team-select|teamSelector|auto-assign' BedWars1058/config.yml BedWars1058/Arenas/sky.yml BPS-Free/config.yml MinigamesAddons/config.yml 2>/dev/null | head -20

echo
echo "=== 哪个插件提供 bwmenu 命令 ==="
for j in *.jar; do
  v=$(unzip -p "$j" plugin.yml 2>/dev/null | grep -i 'bwmenu' | head -1)
  if [ -n "$v" ]; then echo "  $j: $v"; fi
done

echo
echo "=== 所有 yml 中引用 bwmenu 的文件 ==="
grep -rl 'bwmenu' --include='*.yml' . 2>/dev/null | head -10

echo
echo "=== sky.yml 中 TeamSelector 相关 ==="
grep -niE 'teamselector|assigner|team' BedWars1058/Arenas/sky.yml | head -15

echo
echo "=== BedWars1058 config: 队伍/大厅相关片段 ==="
grep -nE 'team|assign|lobby|waiting|start' BedWars1058/config.yml | head -25
