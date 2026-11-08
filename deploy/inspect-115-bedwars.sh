#!/bin/bash
echo "=== /opt/bedwars 概览 ==="
ls /opt/bedwars | head -20
echo -n "  目录大小: "; du -sh /opt/bedwars 2>/dev/null | cut -f1
echo -n "  插件 jar 数: "; ls /opt/bedwars/plugins/*.jar 2>/dev/null | wc -l
echo -n "  slime_worlds 数: "; ls /opt/bedwars/slime_worlds/*.slime 2>/dev/null | wc -l
echo -n "  当前 XBedSync: "; ls /opt/bedwars/plugins/XBedSync.jar 2>/dev/null || echo "未安装"

echo
echo "=== 备份/压缩包候选 ==="
ls -lh /opt/*.zip /root/*.zip 2>/dev/null | head -5
ls -lh /opt/minecraft-backups 2>/dev/null | head -6

echo
echo "=== 端口监听 ==="
ss -lntp 2>/dev/null | grep -E ':255|:24454|:3939' | head -8

echo
echo "=== 服务状态 ==="
systemctl is-active bedwars
echo -n "  进程内存: "; ps -o rss= -p $(systemctl show -p MainPID --value bedwars) 2>/dev/null | awk '{printf "%.0f MB\n", $1/1024}'

echo
echo "=== server.properties 关键项 ==="
grep -E 'server-port|online-mode|enable-rcon|rcon.port|max-players|motd' /opt/bedwars/server.properties 2>/dev/null

echo
echo "=== 磁盘 ==="
df -h / | tail -1
