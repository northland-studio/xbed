#!/bin/bash
set -e
INI=/root/.secrets/cloudflare.ini
echo "=== cloudflare.ini 键名（不打印值）==="
sed -E 's/=.*/=<redacted>/' "$INI" | head -5

TOKEN=$(grep -E '^dns_cloudflare_api_token' "$INI" | cut -d= -f2- | tr -d ' \r')
if [ -z "$TOKEN" ]; then echo "  未找到 API token"; exit 1; fi

echo "=== 查询 zone ==="
ZONES=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/zones?name=xuanjian.top")
echo "$ZONES" | head -c 400; echo
ZONE_ID=$(echo "$ZONES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['id'] if d.get('result') else '')" 2>/dev/null)
echo "  zone_id=${ZONE_ID:0:8}..."

if [ -z "$ZONE_ID" ]; then
  echo "  token 无 zone 读取权限，无法自动切换 SSL 模式"
  exit 0
fi

echo "=== 当前 SSL 模式 ==="
curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/ssl" | head -c 300; echo

echo "=== 尝试设为 strict（Full strict）==="
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data '{"value":"strict"}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/ssl" | head -c 400; echo

echo "=== 验证 ==="
curl -s -o /dev/null -w "  CF https 首页 -> %{http_code}\n" --max-time 15 https://xbed.xuanjian.top/
curl -s --max-time 15 https://xbed.xuanjian.top/api/health; echo
