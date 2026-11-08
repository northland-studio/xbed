#!/bin/bash
echo "=== 所有反作弊踢人记录 ==="
for f in /opt/xbed-bedwars/logs/latest.log /opt/xbed-bedwars/logs/*.log.gz; do
  case "$f" in *.gz) zcat "$f" 2>/dev/null;; *) cat "$f" 2>/dev/null;; esac | grep -aE '反作弊|FairFight|BadPacket|kick' | tail -15
done

echo
echo "=== FairFight checks.yml 全文 ==="
cat /opt/xbed-bedwars/plugins/FairFight/checks.yml

echo
echo "=== FairFight config 中 BadPacket/Via 相关 ==="
grep -nE 'BadPacket|via|protocol|client|exempt|bypass' /opt/xbed-bedwars/plugins/FairFight/config.yml | head -20
