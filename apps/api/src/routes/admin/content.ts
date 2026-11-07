import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app.js';
import type {
  AnnouncementRow,
  MatchAppealRow,
  TeamMemberRow,
  TeamRow,
  UserRow,
} from '../../db/models.js';
import { auditFromRequest } from '../../lib/audit.js';
import { errors } from '../../lib/errors.js';
import { broadcastNotification, createNotification } from '../../lib/notifications.js';
import { listResponse, parseId, parsePagination } from '../../lib/pagination.js';
import { announcementPublic, appealPublic, matchPublic, teamPublic } from '../../lib/serialize.js';
import { nowIso } from '../../lib/time.js';
import { requireSuper } from '../../middleware/auth.js';

export function createContentAdminRouter(ctx: AppContext): Router {
  const { db } = ctx;
  const router = Router();

  // ========== 战队管理 ==========
  router.get('/teams', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const total = (
      db.prepare("SELECT COUNT(*) AS c FROM teams WHERE state = 'active'").get() as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT t.*, u.nickname AS captain_nickname FROM teams t
         LEFT JOIN users u ON u.id = t.captain_id
         WHERE t.state = 'active' ORDER BY t.id DESC LIMIT ? OFFSET ?`,
      )
      .all(pagination.limit, pagination.offset) as Array<TeamRow & { captain_nickname: string | null }>;
    const items = rows.map((row) => {
      const members = db
        .prepare(
          `SELECT tm.*, u.nickname, u.avatar, u.game_id FROM team_members tm
           LEFT JOIN users u ON u.id = tm.user_id
           WHERE tm.team_id = ? AND tm.left_at IS NULL ORDER BY tm.role = 'captain' DESC, tm.id`,
        )
        .all(row.id) as Array<
        TeamMemberRow & { nickname: string | null; avatar: string | null; game_id: string | null }
      >;
      return {
        ...teamPublic(row, {
          captainNickname: row.captain_nickname,
          members: members.map((member) => ({
            member,
            user: {
              id: member.user_id,
              nickname: member.nickname,
              avatar: member.avatar,
              game_id: member.game_id,
            } as UserRow,
          })),
        }),
      };
    });
    res.status(200).json(listResponse(items, total, pagination));
  });

  router.post('/teams/:id/transfer', requireSuper, (req, res) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(parseId(req.params.id, '战队 ID')) as
      | TeamRow
      | undefined;
    if (!team) throw errors.notFound('战队不存在');
    const body = z
      .object({
        captainId: z.number().int().positive().optional(),
        archive: z.boolean().optional(),
        reason: z.string().max(500).optional(),
      })
      .refine((value) => value.archive === true || value.captainId !== undefined, {
        message: '需要 captainId 或 archive:true',
      })
      .parse(req.body);

    const before = { captainId: team.captain_id, state: team.state, membersCount: team.members_count };
    if (body.archive) {
      db.prepare("UPDATE teams SET state = 'archived', updated_at = ? WHERE id = ?").run(nowIso(), team.id);
      db.prepare(
        'UPDATE team_members SET left_at = ? WHERE team_id = ? AND left_at IS NULL',
      ).run(nowIso(), team.id);
      db.prepare('UPDATE teams SET members_count = 0, updated_at = ? WHERE id = ?').run(nowIso(), team.id);
      auditFromRequest(db, req, {
        action: 'team.archive',
        targetType: 'team',
        targetId: team.id,
        before,
        after: { state: 'archived', membersCount: 0 },
        reason: body.reason ?? '管理员强制归档战队',
      });
      res.status(200).json({ ok: true, state: 'archived' });
      return;
    }

    const newCaptainId = body.captainId!;
    const newCaptain = db.prepare('SELECT * FROM users WHERE id = ?').get(newCaptainId) as
      | UserRow
      | undefined;
    if (!newCaptain || newCaptain.status !== 'active') throw errors.notFound('新队长用户不存在');
    const membership = db
      .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ? AND left_at IS NULL')
      .get(team.id, newCaptainId) as TeamMemberRow | undefined;
    if (!membership) throw errors.invalidRequest('新队长必须是当前战队成员');
    db.transaction(() => {
      db.prepare("UPDATE team_members SET role = 'member' WHERE team_id = ? AND role = 'captain'").run(team.id);
      db.prepare("UPDATE team_members SET role = 'captain' WHERE id = ?").run(membership.id);
      db.prepare('UPDATE teams SET captain_id = ?, updated_at = ? WHERE id = ?').run(
        newCaptainId,
        nowIso(),
        team.id,
      );
    })();
    createNotification(db, {
      userId: team.captain_id,
      type: 'team_transfer',
      title: '战队队长已转让',
      content: `管理员已将战队「${team.name}」的队长转让给 ${newCaptain.nickname}。`,
      link: '/me/team',
    });
    createNotification(db, {
      userId: newCaptainId,
      type: 'team_transfer',
      title: '你已成为战队队长',
      content: `你已成为战队「${team.name}」的队长。`,
      link: '/me/team',
    });
    auditFromRequest(db, req, {
      action: 'team.transfer',
      targetType: 'team',
      targetId: team.id,
      before,
      after: { captainId: newCaptainId },
      reason: body.reason ?? '管理员转让队长',
    });
    res.status(200).json({ ok: true, captainId: newCaptainId });
  });

  // ========== 申诉管理 ==========
  router.get('/appeals', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeof req.query.state === 'string' && req.query.state) {
      conditions.push('a.state = ?');
      params.push(req.query.state);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM match_appeals a ${where}`).get(...params) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT a.*, u.nickname, m.arena_display, m.ended_at
         FROM match_appeals a LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN matches m ON m.id = a.match_id
         ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pagination.limit, pagination.offset) as Array<
      MatchAppealRow & { nickname: string | null; arena_display: string | null; ended_at: string | null }
    >;
    const items = rows.map((row) => {
      const replies = db
        .prepare(
          `SELECT r.*, u.nickname FROM appeal_replies r LEFT JOIN users u ON u.id = r.user_id
           WHERE r.appeal_id = ? ORDER BY r.id`,
        )
        .all(row.id) as Array<{
        id: number;
        content: string;
        is_admin: number;
        created_at: string;
        user_id: number;
        nickname: string | null;
      }>;
      const attachments = db
        .prepare('SELECT * FROM appeal_attachments WHERE appeal_id = ? ORDER BY id')
        .all(row.id) as Array<{
        id: number;
        original_name: string | null;
        size_bytes: number;
        sha256: string;
        mime: string | null;
        uploaded_at: string;
      }>;
      return {
        ...appealPublic(row, {
          match: { id: row.match_id, arenaDisplay: row.arena_display, endedAt: row.ended_at },
          replies: replies.map((reply) => ({
            id: reply.id,
            userId: reply.user_id,
            nickname: reply.nickname,
            content: reply.content,
            isAdmin: reply.is_admin === 1,
            createdAt: reply.created_at,
          })),
        }),
        nickname: row.nickname,
        attachments: attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.original_name,
          sizeBytes: attachment.size_bytes,
          sha256: attachment.sha256,
          mime: attachment.mime,
          uploadedAt: attachment.uploaded_at,
          downloadUrl: `/api/appeals/${row.id}/attachments/${attachment.id}/download`,
        })),
      };
    });
    res.status(200).json(listResponse(items, total, pagination));
  });

  router.post('/appeals/:id/reply', (req, res) => {
    const appeal = db.prepare('SELECT * FROM match_appeals WHERE id = ?').get(parseId(req.params.id, '申诉 ID')) as
      | MatchAppealRow
      | undefined;
    if (!appeal) throw errors.notFound('申诉不存在');
    const body = z.object({ content: z.string().trim().min(1).max(2000) }).parse(req.body);
    db.prepare('INSERT INTO appeal_replies (appeal_id, user_id, is_admin, content) VALUES (?, ?, 1, ?)').run(
      appeal.id,
      req.auth!.user.id,
      body.content,
    );
    if (appeal.state === 'open') {
      db.prepare("UPDATE match_appeals SET state = 'processing' WHERE id = ?").run(appeal.id);
    }
    createNotification(db, {
      userId: appeal.user_id,
      type: 'appeal_reply',
      title: '申诉有新回复',
      content: body.content,
      link: '/me/appeals',
    });
    auditFromRequest(db, req, {
      action: 'appeal.reply',
      targetType: 'match_appeal',
      targetId: appeal.id,
      after: { content: body.content },
    });
    res.status(200).json({ ok: true, appealId: appeal.id, content: body.content });
  });

  router.post('/appeals/:id/resolve', (req, res) => {
    const appeal = db.prepare('SELECT * FROM match_appeals WHERE id = ?').get(parseId(req.params.id, '申诉 ID')) as
      | MatchAppealRow
      | undefined;
    if (!appeal) throw errors.notFound('申诉不存在');
    if (appeal.state === 'resolved' || appeal.state === 'rejected') {
      throw errors.conflict('该申诉已处理完毕');
    }
    const body = z
      .object({
        state: z.enum(['resolved', 'rejected']).optional(),
        result: z.string().max(1000).optional(),
        note: z.string().max(2000).optional(),
        resultNote: z.string().max(2000).optional(),
      })
      .parse(req.body ?? {});
    let finalState: 'resolved' | 'rejected' = body.state ?? 'resolved';
    if (!body.state && body.result) {
      const normalized = body.result.toLowerCase();
      if (['rejected', 'dismissed', '驳回', '不通过', '无效'].includes(normalized)) finalState = 'rejected';
    }
    const note = body.note ?? body.resultNote ?? null;
    const result = body.result ?? (finalState === 'resolved' ? '申诉成立' : '申诉驳回');
    db.transaction(() => {
      db.prepare(
        `UPDATE match_appeals SET state = ?, result = ?, result_note = ?, handled_by = ?, handled_at = ?
         WHERE id = ?`,
      ).run(finalState, result, note, req.auth!.user.id, nowIso(), appeal.id);
      db.prepare('INSERT INTO appeal_replies (appeal_id, user_id, is_admin, content) VALUES (?, ?, 1, ?)').run(
        appeal.id,
        req.auth!.user.id,
        `【处理结论】${result}${note ? `：${note}` : ''}`,
      );
    })();
    createNotification(db, {
      userId: appeal.user_id,
      type: 'appeal_resolved',
      title: '申诉已处理',
      content: `处理结论：${result}${note ? `。说明：${note}` : ''}`,
      link: `/appeals/${appeal.id}`,
    });
    auditFromRequest(db, req, {
      action: 'appeal.resolve',
      targetType: 'match_appeal',
      targetId: appeal.id,
      before: { state: appeal.state },
      after: { state: finalState, result, note },
      reason: note,
    });
    const updated = db.prepare('SELECT * FROM match_appeals WHERE id = ?').get(appeal.id) as MatchAppealRow;
    res.status(200).json({ ok: true, appeal: appealPublic(updated, { replies: [] }) });
  });

  // ========== 公告管理 ==========
  const announcementSchema = z.object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(20000),
    category: z.enum(['general', 'season', 'result']).optional(),
    pinned: z.boolean().optional(),
    published: z.boolean().optional(),
  });

  router.get('/announcements', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const total = (db.prepare('SELECT COUNT(*) AS c FROM announcements').get() as { c: number }).c;
    const rows = db
      .prepare('SELECT * FROM announcements ORDER BY pinned DESC, id DESC LIMIT ? OFFSET ?')
      .all(pagination.limit, pagination.offset) as AnnouncementRow[];
    res.status(200).json(listResponse(rows.map(announcementPublic), total, pagination));
  });

  router.post('/announcements', (req, res) => {
    const body = announcementSchema.parse(req.body);
    const info = db
      .prepare(
        `INSERT INTO announcements (title, content, category, pinned, published, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.title,
        body.content,
        body.category ?? 'general',
        body.pinned ? 1 : 0,
        body.published === false ? 0 : 1,
        req.auth!.user.id,
      );
    const row = db
      .prepare('SELECT * FROM announcements WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as AnnouncementRow;
    if (row.published === 1) {
      broadcastNotification(db, {
        type: 'announcement',
        title: `公告：${row.title}`,
        content: row.content.slice(0, 200),
        link: `/announcements/${row.id}`,
      });
    }
    auditFromRequest(db, req, {
      action: 'announcement.create',
      targetType: 'announcement',
      targetId: row.id,
      after: announcementPublic(row),
    });
    res.status(200).json(announcementPublic(row));
  });

  router.patch('/announcements/:id', (req, res) => {
    const row = db
      .prepare('SELECT * FROM announcements WHERE id = ?')
      .get(parseId(req.params.id, '公告 ID')) as AnnouncementRow | undefined;
    if (!row) throw errors.notFound('公告不存在');
    const body = announcementSchema.partial().parse(req.body);
    const before = announcementPublic(row);
    db.prepare(
      `UPDATE announcements SET
         title = COALESCE(?, title), content = COALESCE(?, content),
         category = COALESCE(?, category),
         pinned = COALESCE(?, pinned), published = COALESCE(?, published),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(
      body.title ?? null,
      body.content ?? null,
      body.category ?? null,
      body.pinned === undefined ? null : body.pinned ? 1 : 0,
      body.published === undefined ? null : body.published ? 1 : 0,
      row.id,
    );
    const updated = db.prepare('SELECT * FROM announcements WHERE id = ?').get(row.id) as AnnouncementRow;
    auditFromRequest(db, req, {
      action: 'announcement.update',
      targetType: 'announcement',
      targetId: row.id,
      before,
      after: announcementPublic(updated),
    });
    res.status(200).json(announcementPublic(updated));
  });

  router.delete('/announcements/:id', (req, res) => {
    const row = db
      .prepare('SELECT * FROM announcements WHERE id = ?')
      .get(parseId(req.params.id, '公告 ID')) as AnnouncementRow | undefined;
    if (!row) throw errors.notFound('公告不存在');
    db.prepare('DELETE FROM announcements WHERE id = ?').run(row.id);
    auditFromRequest(db, req, {
      action: 'announcement.delete',
      targetType: 'announcement',
      targetId: row.id,
      before: announcementPublic(row),
      reason: '删除公告',
    });
    res.status(200).json({ ok: true, id: row.id });
  });

  // ========== 全站通知（★ L2） ==========
  router.get('/notifications/broadcast', requireSuper, (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const groups = db
      .prepare(
        `SELECT MIN(id) AS id, title, content, link, COUNT(*) AS recipients, MIN(created_at) AS created_at
         FROM notifications WHERE type = 'broadcast'
         GROUP BY title, content, link ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(pagination.limit, pagination.offset) as Array<{
      id: number;
      title: string;
      content: string | null;
      link: string | null;
      recipients: number;
      created_at: string;
    }>;
    const total = (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM (SELECT 1 FROM notifications WHERE type = 'broadcast' GROUP BY title, content, link)",
        )
        .get() as { c: number }
    ).c;
    res.status(200).json({
      items: groups.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        link: row.link,
        recipients: row.recipients,
        createdAt: row.created_at,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  });

  router.post('/notifications/broadcast', requireSuper, (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        content: z.string().trim().max(5000).optional(),
        link: z.string().trim().max(500).optional(),
      })
      .parse(req.body);
    const recipients = broadcastNotification(db, {
      type: 'broadcast',
      title: body.title,
      content: body.content ?? null,
      link: body.link ?? null,
    });
    auditFromRequest(db, req, {
      action: 'notification.broadcast',
      targetType: 'notification',
      targetId: null,
      after: { title: body.title, content: body.content, link: body.link, recipients },
    });
    res.status(200).json({ ok: true, recipients });
  });

  // 供详情页复用的比赛摘要（避免重复实现）
  router.get('/matches/:id/brief', (req, res) => {
    const match = db
      .prepare('SELECT * FROM matches WHERE id = ?')
      .get(parseId(req.params.id, '比赛 ID'));
    if (!match) throw errors.notFound('比赛不存在');
    res.status(200).json(matchPublic(match as never));
  });

  return router;
}
