#!/bin/bash
echo "=== 1. lookup 接口 ==="
JSON=$(curl -s --max-time 8 'http://127.0.0.1:3000/api/skins/lookup?gameId=Morzane123')
echo "  $JSON"
SKIN=$(printf '%s' "$JSON" | python3 -c "import sys,json;print(json.load(sys.stdin).get('skin') or '')")
echo "  skin 路径: $SKIN"

echo
echo "=== 2. 官网公网皮肤文件 ==="
curl -s -o /tmp/skin.png -w "  https://www.xuanjian.top$SKIN -> %{http_code} %{content_type} %{size_download} bytes\n" --max-time 15 "https://www.xuanjian.top$SKIN"
file /tmp/skin.png 2>/dev/null

echo
echo "=== 3. 本机直连静态文件（绕过 nginx）==="
curl -s -o /tmp/skin2.png -w "  http://127.0.0.1:3000$SKIN -> %{http_code} %{content_type} %{size_download} bytes\n" --max-time 10 "http://127.0.0.1:3000$SKIN"
file /tmp/skin2.png 2>/dev/null

echo
echo "=== 4. 无皮肤用户 ==="
curl -s --max-time 8 'http://127.0.0.1:3000/api/skins/lookup?gameId=xuanjian_guild'; echo
curl -s --max-time 8 'http://127.0.0.1:3000/api/skins/lookup?gameId=NoSuchUser_zzz'; echo
