#!/bin/bash
LOG=/opt/xbed-bedwars/logs/latest.log
echo "=== safemode / 加载失败 关键字 ==="
grep -inE 'safemode|safe mode|fail|failed|could not load|invalid|corrupt' "$LOG" 2>/dev/null | head -30
echo
echo "=== 启动阶段（前 120 行）BedWars/Slime 相关 ==="
head -400 "$LOG" 2>/dev/null | grep -iE 'BedWars|Slime|arena|world|safemode' | head -40
echo
echo "=== slime_worlds 目录 ==="
ls -la /opt/xbed-bedwars/slime_worlds 2>/dev/null | head -12
echo
echo "=== 是否有多份 latest.log / 最近启动时间 ==="
ls -l /opt/xbed-bedwars/logs/ | tail -6
grep -n 'Starting minecraft server' "$LOG" | tail -3
