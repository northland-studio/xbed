#!/bin/bash
CUR=/opt/xbed-bedwars
PRE=$(ls -d /opt/xbed-bedwars.pre-zip-* 2>/dev/null | tail -1)
echo "=== 备份目录: $PRE ==="
echo
echo "=== 当前 TAB 配置概览 ==="
ls -la "$CUR/plugins/TAB" 2>/dev/null | head -10
echo
echo "=== 备份 TAB 配置概览 ==="
ls -la "$PRE/plugins/TAB" 2>/dev/null | head -10
echo
echo "=== 当前 vs 备份 TAB config.yml 差异（前 60 行）==="
diff -u "$CUR/plugins/TAB/config.yml" "$PRE/plugins/TAB/config.yml" 2>/dev/null | head -60
echo
echo "=== 当前 MOTD 相关 ==="
grep -nE 'MOTD|LINES|motd' "$CUR/server.properties" "$CUR/plugins/STN-Studios/config.yml" 2>/dev/null | head -12
echo
echo "=== 备份 MOTD 相关 ==="
grep -nE 'MOTD|LINES|motd' "$PRE/server.properties" "$PRE/plugins/STN-Studios/config.yml" 2>/dev/null | head -12
