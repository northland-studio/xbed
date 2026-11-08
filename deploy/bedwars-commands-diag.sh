#!/bin/bash
echo "=== BedWars1058 plugin.yml commands ==="
unzip -p /opt/xbed-bedwars/plugins/Bedwars-plugin-23.1.1.jar plugin.yml 2>/dev/null | sed -n '/^commands:/,$p' | head -40

echo
echo "=== 最近一次启动日志（-7）中 safe/arena/error ==="
zcat /opt/xbed-bedwars/logs/2026-11-07-7.log.gz 2>/dev/null | grep -inE 'safe|arena|error|warn.*bedwars|failed' | head -30

echo
echo "=== config.yml 中 safemode 相关 ==="
grep -nE 'safe|setup' /opt/xbed-bedwars/plugins/BedWars1058/config.yml | head -10

echo
echo "=== 竞技场文件里是否 setup done ==="
grep -l 'setupDone: true' /opt/xbed-bedwars/plugins/BedWars1058/Arenas/*.yml 2>/dev/null | wc -l
grep -h 'setupDone' /opt/xbed-bedwars/plugins/BedWars1058/Arenas/castle.yml /opt/xbed-bedwars/plugins/BedWars1058/Arenas/sky.yml 2>/dev/null
