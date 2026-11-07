import type { Request } from 'express';
import type { DB } from '../db/index.js';
import type { AuditLogRow } from '../db/models.js';

export interface AuditInput {
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  actorUserId?: number | null;
  actorXuanjianId?: string | null;
  ip?: string | null;
}

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 写入审计日志（只允许 INSERT，不提供修改/删除接口） */
export function writeAudit(db: DB, input: AuditInput): number {
  const info = db
    .prepare(
      `INSERT INTO audit_logs
         (actor_user_id, actor_xuanjian_id, action, target_type, target_id, before_data, after_data, reason, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.actorUserId ?? null,
      input.actorXuanjianId ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId === undefined || input.targetId === null ? null : String(input.targetId),
      serialize(input.before),
      serialize(input.after),
      input.reason ?? null,
      input.ip ?? null,
    );
  return Number(info.lastInsertRowid);
}

/** 从请求上下文写审计（自动带操作者与 IP） */
export function auditFromRequest(
  db: DB,
  req: Request,
  input: Omit<AuditInput, 'actorUserId' | 'actorXuanjianId' | 'ip'>,
): number {
  return writeAudit(db, {
    ...input,
    actorUserId: req.auth?.user.id ?? null,
    actorXuanjianId: req.auth?.user.xuanjian_user_id ?? null,
    ip: req.ip ?? null,
  });
}

export function requestIp(req: Request): string | null {
  return req.ip ?? null;
}

export interface AuditQuery {
  action?: string;
  targetType?: string;
  page: number;
  pageSize: number;
  offset: number;
}

export function queryAuditLogs(db: DB, query: AuditQuery): { items: AuditLogRow[]; total: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.action) {
    conditions.push('a.action LIKE ?');
    params.push(`%${query.action}%`);
  }
  if (query.targetType) {
    conditions.push('a.target_type = ?');
    params.push(query.targetType);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM audit_logs a ${where}`).get(...params) as { c: number }
  ).c;
  const items = db
    .prepare(`SELECT a.* FROM audit_logs a ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`)
    .all(...params, query.pageSize, query.offset) as AuditLogRow[];
  return { items, total };
}
