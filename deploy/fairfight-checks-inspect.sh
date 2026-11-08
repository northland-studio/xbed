#!/bin/bash
F=/opt/xbed-bedwars/plugins/FairFight/checks.yml
echo "=== checks.yml 顶层检查项 ==="
grep -nE '^[a-zA-Z_]+:' "$F"
echo
echo "=== badpacket 段 ==="
awk '/^[a-zA-Z_]+:/{section=$0} section ~ /badpacket|packet|bad/{print NR": "$0}' "$F" | head -40
echo
echo "=== 完整 badpacket 段（若存在）==="
sed -n '/^badpacket:/,/^[a-zA-Z_]*:/p' "$F" | head -40
echo
echo "=== FairFight config 中与版本/豁免相关的键 ==="
grep -nE 'via|protocol|version|exempt|client|ignore' /opt/xbed-bedwars/plugins/FairFight/config.yml | head -10
