#!/bin/bash
cd /opt/xbed-bedwars/logs || exit 1
echo "=== 在所有日志（含 gz）中搜索 safemode / arena 加载 ==="
for f in latest.log *.log.gz; do
  case "$f" in
    *.gz) zcat "$f" 2>/dev/null ;;
    *) cat "$f" 2>/dev/null ;;
  esac | grep -inE 'safemode|safe mode|Load done|arena.*load|Could not|Exception|Unsupported' | sed "s#^#$f: #" | head -12
done

echo
echo "=== 最近一次启动的完整 BedWars 段（journal 窗口）==="
journalctl -u xbed-bedwars --since '2026-11-07 17:57:00' --until '2026-11-07 18:00:00' --no-pager 2>/dev/null | grep -iE 'bedwars|arena|safemode|slime' | head -30
