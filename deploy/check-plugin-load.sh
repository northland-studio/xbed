#!/bin/bash
echo "=== XBedSync 相关日志 ==="
journalctl -u xbed-bedwars --since '-3 min' --no-pager 2>/dev/null | grep -iE 'xbedsync|enabling|error|exception' | tail -25
echo
echo "=== 插件是否被加载（日志中 plugin.yml 名称）==="
journalctl -u xbed-bedwars -n 2000 --no-pager 2>/dev/null | grep -i 'XBedSync' | tail -10
echo
echo "=== 插件目录 ==="
ls -la /opt/xbed-bedwars/plugins/XBedSync/ 2>/dev/null
echo
echo "=== 服务状态 ==="
systemctl is-active xbed-bedwars
