#!/bin/bash
CUR=/opt/xbed-bedwars
PRE=$(ls -d /opt/xbed-bedwars.pre-zip-* 2>/dev/null | tail -1)
echo "备份目录: $PRE"
echo

echo "=== 1. 我们的 TAB 配置（备份里的 header/footer）==="
awk '/^header:/{f=1} f{print} /^footer:/{g=1} g&&/^-/{c++; if(c>4) exit}' "$PRE/plugins/TAB/config.yml" 2>/dev/null | head -14
echo

echo "=== 2. zip 原始 TAB 配置（当前）==="
awk '/^header:/{f=1} f{print} /^footer:/{g=1} g&&/^-/{c++; if(c>4) exit}' "$CUR/plugins/TAB/config.yml" 2>/dev/null | head -14
echo

echo "=== 3. 我们的 MOTD（备份 STN LINES）==="
grep -A5 '^      LINES:' "$PRE/plugins/STN-Studios/config.yml" 2>/dev/null | head -7
echo
echo "=== 4. 当前 MOTD（zip STN LINES）==="
grep -A5 '^      LINES:' "$CUR/plugins/STN-Studios/config.yml" 2>/dev/null | head -7
echo
echo "=== 5. server.properties motd ==="
echo -n "  当前: "; grep '^motd=' "$CUR/server.properties"
echo -n "  备份: "; grep '^motd=' "$PRE/server.properties"
