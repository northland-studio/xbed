import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import type { MatchAppealRow, MatchRow } from '../db/models.js';
import { writeAudit } from '../lib/audit.js';
import { errors } from '../lib/errors.js';
import { listResponse, parseId, parsePagination } from '../lib/pagination.js';
import { appealPublic } from '../lib/serialize.js';
import { getSettingNumber } from '../lib/settings.js';
import {
  createAppealAttachmentUploader,
  pipeEvidenceFile,
  removeStoredFile,
  toUploadedFile,
} from '../lib/storage.js';
import { addHours } from '../lib/time.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/error.js';

const createAppealSchema = z.object({
  type: z.enum(['result', 'points', 'rank']).default('result'),
  content: z.string().trim().min(5, '申诉内容至少 5 个字符').max(2000, '申诉内容最多 2000 个字符'),
});

interface ReplyRow {
  id: number;
  appeal_id: number;
  user_id: number;
  is_admin: number;
  content: string;
  created_at: string;
}

interface AttachmentRow {
  id: number;
  appeal_id: number;
  user_id: number | null;
  original_name: string | null;
  stored_path: string;
  size_bytes: number;
  sha256: string;
  mime: string | null;
  uploaded_at: string;
}

function loadReplies(db: AppContext['db'], appealId: number) {
  const rows = db
    .prepare(
      `SELECT r.*, u.nickname FROM appeal_replies r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.appeal_id = ? ORDER BY r.id ASC`,
    )
    .all(appealId) as Array<ReplyRow & { nickname: string | null }>;
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    content: row.content,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  }));
}

function loadAttachments(db: AppContext['db'], appealId: number) {
  const rows = db
    .prepare('SELECT * FROM appeal_attachments WHERE appeal_id = ? ORDER BY id ASC')
    .all(appealId) as AttachmentRow[];
  return rows.map((row) => ({
    id: row.id,
    appealId: row.appeal_id,
    userId: row.user_id,
    fileName: row.original_name,
    originalName: row.original_name,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    mime: row.mime,
    uploadedAt: row.uploaded_at,
    downloadUrl: `/api/appeals/${appealId}/attachments/${row.id}/download`,
  }));
}

function matchBrief(db: AppContext['db'], matchId: number) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined;
  if (!match) return null;
  return {
    id: match.id,
    arenaDisplay: match.arena_display,
    arena: match.arena,
    endedAt: match.ended_at,
    winnerTeam: match.winner_team,
    state: match.state,
  };
}

function isParticipant(db: AppContext['db'], matchId: number, userId: number): boolean {
  const row = db
    .prepare('SELECT id FROM match_players WHERE match_id = ? AND user_id = ? LIMIT 1')
    .get(matchId, userId) as { id: number } | undefined;
  return Boolean(row);
}

function appealResponse(db: AppContext['db'], row: MatchAppealRow, includeReplies = true) {
  return {
    ...appealPublic(row, {
      replies: includeReplies ? loadReplies(db, row.id) : [],
      match: matchBrief(db, row.match_id),
    }),
    attachments: loadAttachments(db, row.id),
  };
}

export function createAppealsRouter(ctx: AppContext): Router {
  const { db, config } = ctx;
  const router = Router();
  const attachmentUploader = createAppealAttachmentUploader(config);

  router.post('/matches/:id/appeals', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const matchId = parseId(req.params.id, '比赛 ID');
    const body = createAppealSchema.parse(req.body);
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined;
    if (!match) throw errors.notFound('比赛不存在');
    if (!['approved', 'resolved'].includes(match.state)) {
      throw errors.conflict('赛果尚未正式公布，暂不能申诉');
    }
    if (!isParticipant(db, matchId, user.id)) {
      throw errors.forbidden('只能申诉你本人参加的比赛');
    }
    const hours = getSettingNumber(db, 'appeal_deadline_hours', config.limits.appealDeadlineHours);
    const publishedAt = match.reviewed_at ?? match.updated_at;
    const deadline = addHours(publishedAt, hours);
    if (new Date().toISOString() > deadline) {
      throw errors.deadlinePassed(`赛果公布后 ${hours} 小时内才能提交申诉`);
    }
    const info = db
      .prepare(
        `INSERT INTO match_appeals (match_id, user_id, type, content, state)
         VALUES (?, ?, ?, ?, 'open')`,
      )
      .run(matchId, user.id, body.type, body.content);
    const appeal = db
      .prepare('SELECT * FROM match_appeals WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as MatchAppealRow;
    res.status(200).json({
      ok: true,
      appeal: appealResponse(db, appeal),
      deadline,
    });
  });

  router.get('/me/appeals', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const total = (
      db.prepare('SELECT COUNT(*) AS c FROM match_appeals WHERE user_id = ?').get(user.id) as { c: number }
    ).c;
    const rows = db
      .prepare('SELECT * FROM match_appeals WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(user.id, pagination.limit, pagination.offset) as MatchAppealRow[];
    res
      .status(200)
      .json(listResponse(rows.map((row) => appealResponse(db, row)), total, pagination));
  });

  router.get('/appeals/:id', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const appeal = db
      .prepare('SELECT * FROM match_appeals WHERE id = ?')
      .get(parseId(req.params.id, '申诉 ID')) as MatchAppealRow | undefined;
    if (!appeal) throw errors.notFound('申诉不存在');
    if (appeal.user_id !== user.id && (req.auth?.level ?? 0) < 1) {
      throw errors.forbidden('无权查看该申诉');
    }
    res.status(200).json(appealResponse(db, appeal));
  });

  router.post('/appeals/:id/replies', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const appeal = db
      .prepare('SELECT * FROM match_appeals WHERE id = ?')
      .get(parseId(req.params.id, '申诉 ID')) as MatchAppealRow | undefined;
    if (!appeal) throw errors.notFound('申诉不存在');
    const isAdmin = (req.auth?.level ?? 0) >= 1;
    if (appeal.user_id !== user.id && !isAdmin) throw errors.forbidden('无权回复该申诉');
    if (appeal.state === 'resolved' || appeal.state === 'rejected') {
      throw errors.conflict('申诉已处理完毕，不能追加说明');
    }
    const schema = z.object({
      content: z.string().trim().min(1, '回复内容不能为空').max(2000, '回复内容最多 2000 字'),
    });
    const body = schema.parse(req.body);
    db.prepare(
      'INSERT INTO appeal_replies (appeal_id, user_id, is_admin, content) VALUES (?, ?, ?, ?)',
    ).run(appeal.id, user.id, isAdmin ? 1 : 0, body.content);
    if (!isAdmin && appeal.state === 'open') {
      db.prepare("UPDATE match_appeals SET state = 'processing' WHERE id = ?").run(appeal.id);
    }
    if (isAdmin) {
      writeAudit(db, {
        actorUserId: user.id,
        actorXuanjianId: user.xuanjian_user_id,
        action: 'appeal.reply',
        targetType: 'match_appeal',
        targetId: appeal.id,
        after: { content: body.content },
        ip: req.ip ?? null,
      });
    }
    const updated = db.prepare('SELECT * FROM match_appeals WHERE id = ?').get(appeal.id) as MatchAppealRow;
    res.status(200).json({
      ok: true,
      appeal: appealResponse(db, updated),
    });
  });

  // ===== 申诉附件（规格 14.4：证据附件） =====
  router.post(
    '/appeals/:id/attachments',
    requireAuth,
    attachmentUploader.single('file'),
    asyncRoute(async (req, res) => {
      const user = req.auth!.user;
      const appealId = parseId(req.params.id, '申诉 ID');
      const appeal = db.prepare('SELECT * FROM match_appeals WHERE id = ?').get(appealId) as
        | MatchAppealRow
        | undefined;
      if (!appeal) {
        if (req.file) removeStoredFile(config, (req.file as Express.Multer.File & { storedPath?: string }).storedPath ?? '');
        throw errors.notFound('申诉不存在');
      }
      if (appeal.user_id !== user.id) {
        if (req.file) removeStoredFile(config, (req.file as Express.Multer.File & { storedPath?: string }).storedPath ?? '');
        throw errors.forbidden('只能为自己的申诉上传附件');
      }
      if (appeal.state === 'resolved' || appeal.state === 'rejected') {
        if (req.file) removeStoredFile(config, (req.file as Express.Multer.File & { storedPath?: string }).storedPath ?? '');
        throw errors.conflict('申诉已处理完毕，不能再上传附件');
      }
      if (!req.file) throw errors.invalidRequest('缺少文件字段 file');

      try {
        const uploaded = toUploadedFile(req.file);
        const info = db
          .prepare(
            `INSERT INTO appeal_attachments
               (appeal_id, user_id, original_name, stored_path, size_bytes, sha256, mime)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            appealId,
            user.id,
            uploaded.originalName,
            uploaded.storedPath,
            uploaded.size,
            uploaded.sha256,
            uploaded.mime || null,
          );
        if (appeal.state === 'open') {
          db.prepare("UPDATE match_appeals SET state = 'processing' WHERE id = ?").run(appealId);
        }
        const attachment = db
          .prepare('SELECT * FROM appeal_attachments WHERE id = ?')
          .get(Number(info.lastInsertRowid)) as AttachmentRow;
        res.status(200).json({
          ok: true,
          attachment: {
            id: attachment.id,
            appealId: attachment.appeal_id,
            fileName: attachment.original_name,
            sizeBytes: attachment.size_bytes,
            sha256: attachment.sha256,
            mime: attachment.mime,
            uploadedAt: attachment.uploaded_at,
            downloadUrl: `/api/appeals/${appealId}/attachments/${attachment.id}/download`,
          },
        });
      } catch (error) {
        removeStoredFile(config, toUploadedFile(req.file).storedPath);
        throw error;
      }
    }),
  );

  router.get('/appeals/:id/attachments/:attachmentId/download', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const appealId = parseId(req.params.id, '申诉 ID');
    const attachmentId = parseId(req.params.attachmentId, '附件 ID');
    const attachment = db
      .prepare('SELECT * FROM appeal_attachments WHERE id = ? AND appeal_id = ?')
      .get(attachmentId, appealId) as AttachmentRow | undefined;
    if (!attachment) throw errors.notFound('附件不存在');
    const isAdmin = (req.auth?.level ?? 0) >= 1;
    if (attachment.user_id !== user.id && !isAdmin) {
      throw errors.forbidden('只能下载自己上传的申诉附件');
    }
    writeAudit(db, {
      actorUserId: user.id,
      actorXuanjianId: user.xuanjian_user_id,
      action: 'appeal.attachment_download',
      targetType: 'appeal_attachment',
      targetId: attachment.id,
      after: { appealId, fileName: attachment.original_name, sizeBytes: attachment.size_bytes },
      ip: req.ip ?? null,
    });
    pipeEvidenceFile(config, res, {
      stored_path: attachment.stored_path,
      original_name: attachment.original_name,
      size_bytes: attachment.size_bytes,
      sha256: attachment.sha256,
      mime: attachment.mime,
    });
  });

  return router;
}
