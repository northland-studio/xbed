import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DB = Database.Database;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
/** apps/api/db/schema.sql（src/db 与 dist/db 下均成立） */
export const SCHEMA_FILE = path.resolve(moduleDir, '..', '..', 'db', 'schema.sql');

/**
 * 打开 SQLite 数据库（WAL + 外键 + busy_timeout）。
 * 文件路径为 `:memory:` 时用于测试。
 */
export function openDatabase(file: string): DB {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function readSchemaSql(): string {
  return fs.readFileSync(SCHEMA_FILE, 'utf8');
}

/** 执行 schema.sql（幂等：所有语句均为 IF NOT EXISTS / INSERT OR IGNORE） */
export function migrateDatabase(db: DB): void {
  db.exec(readSchemaSql());
}

/** 数据库健康检查，返回 true/false */
export function pingDatabase(db: DB): boolean {
  try {
    const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    return row?.ok === 1;
  } catch {
    return false;
  }
}

/** 清理过期会话 / OAuth state / nonce，返回删除行数 */
export function cleanupExpired(db: DB): { sessions: number; oauthStates: number; nonces: number } {
  const now = new Date().toISOString();
  const sessions = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now).changes;
  const oauthStates = db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(now).changes;
  const nonces = db
    .prepare(
      "DELETE FROM server_nonces WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')",
    )
    .run().changes;
  return { sessions, oauthStates, nonces };
}
