#!/bin/bash
set -e
APP=/var/www/xbed
cd $APP/api
rm -rf dist.tmp && mkdir dist.tmp
tar -xzf /root/api5.tgz -C dist.tmp
rm -rf dist && mv dist.tmp/dist dist
pm2 restart xbed-api --update-env >/dev/null
sleep 5
curl -s --max-time 8 http://127.0.0.1:3939/api/health; echo

rm -rf $APP/web.tmp && mkdir -p $APP/web.tmp
tar -xzf /root/web5.tgz -C $APP/web.tmp
rm -rf $APP/web && mv $APP/web.tmp/dist $APP/web
rm -rf $APP/web.tmp
systemctl reload nginx
echo "=== 线上验证：未公布比赛对游客仍 404 ==="
curl -s -o /dev/null -w "  /api/matches/7 (游客) -> %{http_code}\n" --max-time 8 http://127.0.0.1:3939/api/matches/7
echo "=== 参赛玩家可见性（临时会话）==="
DB=$APP/data/xbed.db
SID=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
EXP=$(date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%S.000Z)
sqlite3 "$DB" "INSERT INTO sessions (id,user_id,level_snapshot,ip,user_agent,created_at,expires_at) VALUES ('$SID',1,2,'127.0.0.1','ops-verify','$NOW','$EXP');"
curl -s -o /tmp/m7.json -w "  /api/matches/7 (玩家1) -> %{http_code}\n" -H "Cookie: xbed_sess=$SID" --max-time 8 http://127.0.0.1:3939/api/matches/7
python3 - <<'PY'
import json
try:
    d = json.load(open('/tmp/m7.json'))
    print('  published =', d.get('published'), '| viewerIsParticipant =', d.get('viewerIsParticipant'), '| state =', d.get('state'))
except Exception as e:
    print('  解析失败:', e)
PY
curl -s -o /tmp/meprofile.json -w "  /api/me/profile (玩家1) -> %{http_code}\n" -H "Cookie: xbed_sess=$SID" --max-time 8 http://127.0.0.1:3939/api/me/profile
python3 - <<'PY'
import json
try:
    d = json.load(open('/tmp/meprofile.json'))
    ms = d.get('recentMatches') or []
    print('  recentMatches 数量 =', len(ms))
    if ms:
        m = ms[0]
        print('  最近一场:', m.get('id'), m.get('state'), '| 日志证据=', m.get('logState'), '| 回放证据=', m.get('replayState'), '| 截止=', m.get('evidenceDeadline'))
except Exception as e:
    print('  解析失败:', e)
PY
sqlite3 "$DB" "DELETE FROM sessions WHERE id = '$SID';"
echo "  临时会话已清理"
