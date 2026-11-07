import type { DB } from '../db/index.js';
import type { NotificationRow } from '../db/models.js';
import { asBool, notificationPublic } from './serialize.js';

export interface NotificationInput {
  userId: number;
  type: string;
  title: string;
  content?: string | null;
  link?: string | null;
}

export function createNotification(db: DB, input: NotificationInput): number {
  const info = db
    .prepare('INSERT INTO notifications (user_id, type, title, content, link) VALUES (?, ?, ?, ?, ?)')
    .run(input.userId, input.type, input.title, input.content ?? null, input.link ?? null);
  return Number(info.lastInsertRowid);
}

/** 给所有 active 用户发通知（公告/全站广播） */
export function broadcastNotification(
  db: DB,
  input: { type: string; title: string; content?: string | null; link?: string | null },
): number {
  const users = db.prepare("SELECT id FROM users WHERE status = 'active'").all() as Array<{ id: number }>;
  const insert = db.prepare(
    'INSERT INTO notifications (user_id, type, title, content, link) VALUES (?, ?, ?, ?, ?)',
  );
  const run = db.transaction(() => {
    let count = 0;
    for (const user of users) {
      insert.run(user.id, input.type, input.title, input.content ?? null, input.link ?? null);
      count += 1;
    }
    return count;
  });
  return run();
}

export function listNotifications(
  db: DB,
  userId: number,
  options: { limit: number; offset: number; unreadOnly?: boolean },
): { items: NotificationRow[]; total: number } {
  const unreadWhere = options.unreadOnly ? 'AND is_read = 0' : '';
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? ${unreadWhere}`)
      .get(userId) as { c: number }
  ).c;
  const items = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ? ${unreadWhere} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, options.limit, options.offset) as NotificationRow[];
  return { items, total };
}

export function unreadNotificationCount(db: DB, userId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(userId) as { c: number };
  return row.c;
}

export function notificationItem(row: NotificationRow) {
  return { ...notificationPublic(row), isRead: asBool(row.is_read) };
}
