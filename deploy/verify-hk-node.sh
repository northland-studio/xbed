#!/bin/bash
set -u
echo "Node: $(node -v)   npm: $(npm -v)"
rm -rf /tmp/bsql-test && mkdir -p /tmp/bsql-test && cd /tmp/bsql-test
npm init -y >/dev/null 2>&1
echo "安装 better-sqlite3@13.0.3 ..."
npm i better-sqlite3@13.0.3 --no-audit --no-fund 2>&1 | tail -3
cat > /tmp/bsql-test/t.js <<'JS'
try {
  const D = require('/tmp/bsql-test/node_modules/better-sqlite3');
  const db = new D(':memory:');
  db.exec('CREATE TABLE t(a INTEGER)');
  db.prepare('INSERT INTO t VALUES (?)').run(42);
  console.log('OK better-sqlite3 13 loaded on', process.version, 'value=', db.prepare('SELECT a FROM t').get().a);
} catch (e) {
  console.log('FAIL:', e.message.split('\n')[0]);
}
JS
node /tmp/bsql-test/t.js
rm -rf /tmp/bsql-test
