#!/bin/bash
D=/var/www/xbed/api/dist/routes/ingest.js
echo "=== 部署的 ingest.js 赛季匹配逻辑 ==="
grep -n "seasons WHERE state" "$D" || echo "  未找到"
grep -n "no_season" "$D" | head -3
echo "=== 文件时间 ==="
ls -l "$D"
echo
echo "=== 本地源码对应行 ==="
grep -n "seasons WHERE state" /root/*.ts 2>/dev/null | head -3
echo
echo "=== 直接查询数据库：running 赛季 ==="
sqlite3 -header -column /var/www/xbed/data/xbed.db "SELECT id,code,state,start_at,end_at FROM seasons;"
echo
echo "=== 手动验证匹配：now-5min 是否在窗口内 ==="
/usr/bin/node -e "
const db=require('/var/www/xbed/api/node_modules/better-sqlite3')('/var/www/xbed/data/xbed.db');
const rows=db.prepare(\"SELECT * FROM seasons WHERE state='running'\").all();
console.log('running 赛季数:', rows.length);
const t=Date.now()-5*60*1000;
for (const s of rows) {
  console.log(' season', s.id, 'start', s.start_at, 'end', s.end_at, 'match?', (!s.start_at||Date.parse(s.start_at)<=t) && (!s.end_at||Date.parse(s.end_at)>=t));
}
console.log('测试时间戳:', new Date(t).toISOString());
"
