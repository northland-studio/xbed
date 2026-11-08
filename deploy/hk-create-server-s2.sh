#!/bin/bash
set -e
DB=/var/www/xbed/data/xbed.db
SID=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
EXP=$(date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%S.000Z)
sqlite3 "$DB" "INSERT INTO sessions (id,user_id,level_snapshot,ip,user_agent,created_at,expires_at) VALUES ('$SID',1,2,'127.0.0.1','ops-create-server','$NOW','$EXP');"

echo "=== 创建服务器 s2 ==="
curl -s -X POST http://127.0.0.1:3939/api/admin/servers \
  -H "Cookie: xbed_sess=$SID" -H 'Content-Type: application/json' \
  -d '{"serverKey":"s2","name":"115 起床战争服","note":"northland-webserver 115.190.153.44"}' | tee /tmp/s2.json
echo

echo "=== 解析密钥 ==="
python3 - <<'PY'
import json
d = json.load(open('/tmp/s2.json'))
secret = d.get('secret') or (d.get('server') or {}).get('secret')
print('serverKey:', (d.get('server') or {}).get('serverKey') or d.get('serverKey'))
print('secret:', secret)
open('/tmp/s2-secret.txt','w').write(secret or '')
PY
cat /tmp/s2-secret.txt; echo

sqlite3 "$DB" "DELETE FROM sessions WHERE id = '$SID';"
echo "临时会话已清理"
