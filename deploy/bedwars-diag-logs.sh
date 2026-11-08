#!/bin/bash
echo "=== 服务状态 ==="
systemctl is-active xbed-bedwars
echo
echo "=== 最近 80 行日志（含错误/警告）==="
journalctl -u xbed-bedwars -n 200 --no-pager 2>/dev/null | grep -iE 'error|warn|exception|BedWars1058|arena|authme|xbedsync|disabled|restart' | tail -40
echo
echo "=== latest.log 中的 BedWars 相关 ==="
tail -400 /opt/xbed-bedwars/logs/latest.log 2>/dev/null | grep -iE 'BedWars|arena|error|exception|warn' | tail -30
echo
echo "=== AuthMe 关键限制 ==="
grep -nE 'allowMovement|teleportUnAuthedToSpawn|allowedCommands|kickNonRegistered|applyBlindEffect' /opt/xbed-bedwars/plugins/AuthMe/config.yml 2>/dev/null | head -10
echo
echo "=== BedWars1058 config 关键项 ==="
grep -nE '^(language|rejoin|bungee|debug|arena|playerLimit|stats|database|enable)' /opt/xbed-bedwars/plugins/BedWars1058/config.yml 2>/dev/null | head -20
