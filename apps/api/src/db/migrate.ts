import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getConfig } from '../config.js';
import { migrateDatabase, openDatabase } from './index.js';

async function main(): Promise<void> {
  const config = getConfig();
  const db = openDatabase(config.dbFile);
  try {
    migrateDatabase(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;
    console.log(`[migrate] 数据库: ${config.dbFile}`);
    console.log(`[migrate] 已应用 schema.sql，共 ${tables.length} 张表:`);
    console.log(`          ${tables.map((t) => t.name).join(', ')}`);
    const mode = db.pragma('journal_mode', { simple: true });
    console.log(`[migrate] journal_mode=${String(mode)}`);
  } finally {
    db.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error('[migrate] 失败:', error);
    process.exitCode = 1;
  });
}

export { migrateDatabase, openDatabase };
