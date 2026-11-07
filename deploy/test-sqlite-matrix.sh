#!/bin/bash
echo "=== 组合测试：better-sqlite3 版本 x Node 版本 ==="
test_combo() {
  local ver="$1" nodebin="$2"
  local dir="/tmp/bst-$ver-$(basename $nodebin)"
  rm -rf "$dir"; mkdir -p "$dir"; cd "$dir"
  "$nodebin" -e "process.exit(0)" 2>/dev/null || { echo "  node 不可用: $nodebin"; return; }
  local npmbin
  npmbin="$(dirname $nodebin)/npm"
  "$npmbin" init -y >/dev/null 2>&1
  "$npmbin" i "better-sqlite3@$ver" --no-audit --no-fund >/dev/null 2>&1
  cat > t.cjs <<JS
try {
  const D = require('$dir/node_modules/better-sqlite3');
  const db = new D(':memory:');
  db.exec('CREATE TABLE t(a)');
  db.prepare('INSERT INTO t VALUES (?)').run(1);
  console.log('  OK  bs3=$ver node=$($nodebin -v) =>', JSON.stringify(db.prepare('SELECT count(*) c FROM t').get()));
} catch (e) { console.log('  FAIL bs3=$ver node=$($nodebin -v):', e.message.split('\n')[0]); }
JS
  "$nodebin" t.cjs
  cd /tmp && rm -rf "$dir"
}

for v in 12.2.0 11.10.0 13.0.3; do
  test_combo "$v" /opt/node22/bin/node
  test_combo "$v" /usr/bin/node
done
