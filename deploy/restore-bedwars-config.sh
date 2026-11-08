#!/bin/bash
set -e
A=/opt/xbed-bedwars/plugins/BedWars1058/Arenas
BK=$(ls -d /opt/xbed-bedwars/plugins/BedWars1058/Arenas.bak-minplayers-* 2>/dev/null | tail -1)
C=/opt/xbed-bedwars/plugins/BedWars1058/config.yml

echo "=== 1. 恢复竞技场 minPlayers 原值 ==="
echo "  从备份恢复: $BK"
cp -a "$BK"/*.yml "$A"/
echo "  抽样确认："
grep -H '^minPlayers:' "$A"/sky.yml "$A"/before.yml "$A"/icy.yml "$A"/blossom.yml "$A"/castle.yml "$A"/egypt.yml "$A"/rio.yml "$A"/xenos.yml 2>/dev/null

echo
echo "=== 2. 关闭 BedWars1058 调试日志 ==="
python3 - "$C" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s2, n = re.subn(r'(?m)^debug: true\s*$', 'debug: false', s)
open(p, 'w', encoding='utf-8').write(s2)
print(f'  debug 已关闭（{n} 处）')
PY
grep -n '^debug:' "$C"

echo
echo "=== 3. 保留的正式修复项确认 ==="
echo -n "  TeamSelector 插件状态: "
if [ -f /opt/xbed-bedwars/plugins/Bedwars1058-Team-Selector.jar.disabled ]; then echo "已禁用（采用默认自动分队）"; else echo "仍启用"; fi
echo -n "  实验性队伍分配器: "
grep 'use-experimental-team-assigner' "$C" | sed 's/^ *//'
echo -n "  FairFight badpacket 处罚: "
awk '/^badpacket:/{f=1} f&&/punishable: false/{c++} END{print (c?"已关闭（"c" 处）":"仍开启")}' /opt/xbed-bedwars/plugins/FairFight/checks.yml 2>/dev/null || echo "FairFight 未安装"
echo -n "  STN MOTD 行数: "
awk '/^      LINES:/{f=1;next} f&&/^        - /{c++} f&&!/^        - /{f=0} END{print c+0}' /opt/xbed-bedwars/plugins/STN-Studios/config.yml 2>/dev/null || echo "STN 未安装"
echo -n "  XBedSync 插件: "
ls -l /opt/xbed-bedwars/plugins/XBedSync.jar 2>/dev/null | awk '{print $5" bytes"}' || echo "未安装"

echo
echo "=== 4. 重启服务器 ==="
systemctl restart xbed-bedwars
sleep 34
systemctl is-active xbed-bedwars
echo
echo "=== 5. 启动校验 ==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -acE 'Load done' | sed 's/^/  已加载竞技场数: /'
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -aiE 'TeamSelectorAssigner|XBedSync|MULTIARENA|Done \(' | tail -6
