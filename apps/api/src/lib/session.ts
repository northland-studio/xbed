import type { Response } from 'express';
import type { AppConfig } from '../config.js';
import type { DB } from '../db/index.js';
import type { SessionRow, UserRow } from '../db/models.js';
import { randomHex } from './crypto.js';
import { addDays, nowIso } from './time.js';

export const SESSION_COOKIE = 'xbed_sess';

export interface CreateSessionInput {
  userId: number;
  level: number;
  ip?: string | null;
  userAgent?: string | null;
  ttlDays?: number;
}

export interface SessionWithUser {
  session: SessionRow;
  user: UserRow;
}

export function createSession(db: DB, input: CreateSessionInput): { id: string; expiresAt: string } {
  const id = randomHex(32);
  const createdAt = nowIso();
  const expiresAt = addDays(createdAt, input.ttlDays ?? 7);
  db.prepare(
    `INSERT INTO sessions (id, user_id, level_snapshot, ip, user_agent, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.userId, input.level, input.ip ?? null, input.userAgent ?? null, createdAt, expiresAt);
  return { id, expiresAt };
}

/** 查询有效会话及用户；过期会话顺手删除 */
export function findSession(db: DB, sessionId: string, now = nowIso()): SessionWithUser | null {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    | SessionRow
    | undefined;
  if (!session) return null;
  if (session.expires_at < now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as
    | UserRow
    | undefined;
  if (!user) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return { session, user };
}

export function destroySession(db: DB, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function destroyUserSessions(db: DB, userId: number): number {
  return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

export function setSessionCookie(
  res: Response,
  config: AppConfig,
  sessionId: string,
  expiresAt: string,
): void {
  const maxAge = Math.max(0, Date.parse(expiresAt) - Date.now());
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
}

export function readSessionId(cookies: Record<string, unknown> | undefined): string | undefined {
  const value = cookies?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
