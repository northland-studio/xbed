#!/bin/bash
set -e
P=/opt/xbed-bedwars/plugins

echo "=== TeamSelector 相关文件/配置 ==="
ls -la "$P" | grep -i team
find "$P" -maxdepth 3 -iname '*team*' -exec ls -ld {} \; 2>/dev/null | head -12
grep -rniE 'team|assign|selector' "$P/BedWars1058/config.yml" | grep -iE 'assign|selector' | head -10

echo
echo "=== 备份并禁用 TeamSelector 插件 ==="
mv "$P/Bedwars1058-Team-Selector.jar" "$P/Bedwars1058-Team-Selector.jar.disabled"
ls -l "$P/Bedwars1058-Team-Selector.jar.disabled" | head -2

echo "=== 关闭实验性队伍分配器（用默认自动均衡分配）==="
python3 - "$P/BedWars1058/config.yml" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
before = s
s = s.replace('use-experimental-team-assigner: true', 'use-experimental-team-assigner: false')
open(p, 'w', encoding='utf-8').write(s)
print('  已修改' if s != before else '  未找到该配置项')
PY
grep -n 'use-experimental-team-assigner' "$P/BedWars1058/config.yml"

echo
echo "=== 重启服务器 ==="
systemctl restart xbed-bedwars
sleep 34
systemctl is-active xbed-bedwars

echo "=== 启动日志：是否仍用 TeamSelectorAssigner ==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -aiE 'TeamSelector|assigner|Load done: sky|MULTIARENA|Team-Selector' | tail -12
echo "=== 插件数量检查 ==="
journalctl -u xbed-bedwars --since '-1 min' --no-pager | grep -ac 'Enabling' | head -1
