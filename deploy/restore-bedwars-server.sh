#!/bin/bash
set -e
APP=/opt/xbed-bedwars
SRC=/opt/xbed-bedwars.bak-20261108-013809

echo "=== 1. 恢复可用的服务器目录（含 AuthMe/FairFight/XBedSync）==="
if [ -d "$APP" ]; then mv "$APP" "/opt/xbed-bedwars.broken-$(date +%Y%m%d-%H%M%S)"; fi
mv "$SRC" "$APP"
ls -ld "$APP"
ls "$APP"/plugins/*.jar | wc -l | sed 's/^/  插件数: /'

echo
echo "=== 2. 恢复竞技场 minPlayers 原值 ==="
BK="$APP/plugins/BedWars1058/Arenas.bak-minplayers-20261108-013039"
if [ -d "$BK" ]; then
  cp -a "$BK"/*.yml "$APP/plugins/BedWars1058/Arenas/"
  echo "  已从备份恢复"
else
  echo "  ⚠ 备份目录不存在，跳过"
fi
grep -H '^minPlayers:' "$APP"/plugins/BedWars1058/Arenas/sky.yml "$APP"/plugins/BedWars1058/Arenas/before.yml "$APP"/plugins/BedWars1058/Arenas/icy.yml "$APP"/plugins/BedWars1058/Arenas/castle.yml "$APP"/plugins/BedWars1058/Arenas/xenos.yml

echo
echo "=== 3. 关闭调试日志 ==="
python3 - "$APP/plugins/BedWars1058/config.yml" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s2, n = re.subn(r'(?m)^debug: true\s*$', 'debug: false', s)
open(p, 'w', encoding='utf-8').write(s2)
print(f'  debug: false（{n} 处）')
PY

echo
echo "=== 4. 保留的正式修复项 ==="
[ -f "$APP/plugins/Bedwars1058-Team-Selector.jar.disabled" ] && echo "  TeamSelector: 已禁用（自动分队生效）" || echo "  TeamSelector: 未禁用"
grep -q 'use-experimental-team-assigner: false' "$APP/plugins/BedWars1058/config.yml" && echo "  实验性分队: false" || echo "  实验性分队: true"
echo -n "  FairFight badpacket 处罚: "
awk '/^badpacket:/{f=1} f&&/punishable: false/{c++} END{print (c?c" 处已关闭":"仍开启")}' "$APP/plugins/FairFight/checks.yml" 2>/dev/null

echo
echo "=== 5. 启动 ==="
systemctl start xbed-bedwars
sleep 38
systemctl is-active xbed-bedwars
echo
echo "=== 6. 启动校验 ==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -ac 'Load done' | sed 's/^/  已加载竞技场: /'
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -aiE 'XBedSync|MULTIARENA|TeamSelectorAssigner|Done \(' | tail -6
echo
echo "=== 7. 端口监听 ==="
ss -lntp 2>/dev/null | grep -E ':25565|:25575' | head -4
