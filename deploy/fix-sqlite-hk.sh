#!/bin/bash
APP=/var/www/xbed/api
cd $APP || exit 1
echo "=== npm 配置 ==="
/opt/node22/bin/npm config get ignore-scripts
echo "=== node_modules 内容（better-sqlite3）==="
ls -la node_modules/better-sqlite3 | head -10
echo "=== 尝试重建原生模块 ==="
/opt/node22/bin/npm rebuild better-sqlite3 --foreground-scripts 2>&1 | tail -15
echo "=== 重建后检查 ==="
find node_modules/better-sqlite3 -name '*.node' 2>/dev/null | head -5
echo "=== 加载测试（.cjs）==="
cat > /tmp/t22.cjs <<'JS'
try {
  const D = require('/var/www/xbed/api/node_modules/better-sqlite3');
  const db = new D('/tmp/t22b.db');
  db.exec('CREATE TABLE IF NOT EXISTS t(a)');
  db.prepare('INSERT INTO t VALUES (?)').run(1);
  console.log('OK', process.version, JSON.stringify(db.prepare('SELECT count(*) c FROM t').get()));
} catch (e) { console.log('FAIL', e.message.split('\n')[0]); }
JS
cd /tmp && /opt/node22/bin/node t22.cjs; echo "exit=$?"
