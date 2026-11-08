#!/bin/bash
# 验证 s1 / s2 两把服务器密钥都能通过 /api/ingest/ping
sign() {
  local method="$1" path="$2" ts="$3" nonce="$4" body="$5" secret="$6"
  local bodyhash
  bodyhash=$(printf '%s' "$body" | sha256sum | awk '{print $1}')
  printf '%s\n%s\n%s\n%s\n%s' "$method" "$path" "$ts" "$nonce" "$bodyhash" \
    | openssl dgst -sha256 -hmac "$secret" -binary | xxd -p -c 256
}

for pair in "s1:854593b35b4a09cb37b776d9b1fbc0b67e5185dd0f1e568910da796af543ade0" \
            "s2:e551002094a1d468e4d587b56ff391af214dd0de8c3488bf53fdb9a35fd50e03"; do
  KEY="${pair%%:*}"
  SECRET="${pair#*:}"
  TS=$(date +%s)
  NONCE=$(openssl rand -hex 16)
  SIG=$(sign GET /api/ingest/ping "$TS" "$NONCE" "" "$SECRET")
  echo "=== $KEY ==="
  curl -s --max-time 10 http://127.0.0.1:3939/api/ingest/ping \
    -H "X-XBed-Server: $KEY" -H "X-XBed-Timestamp: $TS" -H "X-XBed-Nonce: $NONCE" -H "X-XBed-Signature: $SIG"
  echo
done

echo "=== 服务器列表 ==="
sqlite3 -header -column /var/www/xbed/data/xbed.db "SELECT id,server_key,name,state,last_seen_at FROM servers;"
