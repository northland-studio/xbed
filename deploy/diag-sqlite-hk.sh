#!/bin/bash
APP=/var/www/xbed/api
cd $APP || exit 1
echo "=== node/npm ==="
/opt/node22/bin/node -v
echo "=== better-sqlite3 版本 ==="
cat node_modules/better-sqlite3/package.json | grep '"version"' | head -1
echo "=== 原生模块文件 ==="
ls -l node_modules/better-sqlite3/build/Release/*.node 2>/dev/null
file node_modules/better-sqlite3/build/Release/better_sqlite3.node 2>/dev/null
echo "=== 依赖库 ==="
ldd node_modules/better-sqlite3/build/Release/better_sqlite3.node 2>&1 | head -10
echo "=== 最小加载测试 ==="
cat > /tmp/t22.js <<'JS'
try {
  const D = require('/var/www/xbed/api/node_modules/better-sqlite3');
  const db = new D('/tmp/t22.db');
  db.exec('CREATE TABLE IF NOT EXISTS t(a)');
  db.prepare('INSERT INTO t VALUES (?)').run(1);
  console.log('OK', process.version, db.prepare('SELECT count(*) c FROM t').get());
} catch (e) { console.log('FAIL', e.message); }
JS
/opt/node22/bin/node /tmp/t22.js; echo "exit=$?"
echo "=== 系统信息 ==="
uname -m; lsb_release -d 2>/dev/null | head -1
