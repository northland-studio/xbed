import fs from 'node:fs';
import { Router } from 'express';
import type { AppContext } from '../app.js';
import type { MatchEvidenceRow, MatchRow } from '../db/models.js';
import { errors } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { parseId } from '../lib/pagination.js';
import { addMinutes, isPast, nowIso } from '../lib/time.js';
import { getSettingNumber } from '../lib/settings.js';
import {
  createEvidenceUploader,
  pipeEvidenceFile,
  removeStoredFile,
  toUploadedEvidenceFile,
  type EvidenceKind,
} from '../lib/storage.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/error.js';
import { rateLimit } from '../middleware/rateLimit.js';

function loadMatch(ctxContext: AppContext, matchId: number): MatchRow {
  const match = ctxContext.db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as
    | MatchRow
    | undefined;
  if (!match) throw errors.notFound('比赛不存在');
  return match;
}

function evidenceDeadline(ctxContext: AppContext, match: MatchRow): string | null {
  if (!match.ended_at) return null;
  const minutes = getSettingNumber(
    ctxContext.db,
    'evidence_deadline_minutes',
    ctxContext.config.limits.evidenceDeadlineMinutes,
  );
  return addMinutes(match.ended_at, minutes);
}

function isParticipant(ctxContext: AppContext, matchId: number, userId: number): boolean {
  const row = ctxContext.db
    .prepare('SELECT id FROM match_players WHERE match_id = ? AND user_id = ? LIMIT 1')
    .get(matchId, userId) as { id: number } | undefined;
  return Boolean(row);
}

function ensureParticipant(ctxContext: AppContext) {
  return (req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction): void => {
    try {
      const matchId = parseId(req.params.id, '比赛 ID');
      const match = loadMatch(ctxContext, matchId);
      if (match.state === 'void') throw errors.conflict('比赛已作废，无法提交证据');
      if (!isParticipant(ctxContext, matchId, req.auth!.user.id)) {
        throw errors.forbidden('仅本场参赛玩家可以上传证据');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function upsertSubmissionState(
  ctxContext: AppContext,
  kind: EvidenceKind,
  matchId: number,
  userId: number,
  evidenceId: number,
  state: string,
): void {
  const table = kind === 'latest_log' ? 'match_logs' : 'match_replays';
  ctxContext.db
    .prepare(
      `INSERT INTO ${table} (match_id, user_id, evidence_id, state, submitted_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(match_id, user_id) DO UPDATE SET
         evidence_id = excluded.evidence_id,
         state = excluded.state,
         submitted_at = excluded.submitted_at`,
    )
    .run(matchId, userId, evidenceId, state, nowIso());
}

function sendEvidenceFile(
  ctxContext: AppContext,
  res: import('express').Response,
  evidence: MatchEvidenceRow,
): void {
  pipeEvidenceFile(ctxContext.config, res, evidence);
}

export function createEvidenceRouter(ctx: AppContext): Router {
  const { db, config } = ctx;
  const router = Router();
  const logUploader = createEvidenceUploader(config, 'latest_log');
  const replayUploader = createEvidenceUploader(config, 'replay');
  const uploadRateLimit = rateLimit({
    name: 'evidence-upload',
    windowMs: 60_000,
    max: 20,
    disabled: config.rateLimitDisabled,
    keyGenerator: (req) => req.auth?.user.id?.toString() ?? req.ip ?? 'unknown',
  });

  const uploadHandler = (kind: EvidenceKind) =>
    asyncRoute(async (req: import('express').Request, res: import('express').Response) => {
      const user = req.auth!.user;
      const matchId = parseId(req.params.id, '比赛 ID');
      const match = loadMatch(ctx, matchId);
      const file = req.file;
      if (!file) throw errors.invalidRequest('缺少文件字段 file');

      let uploaded;
      try {
        uploaded = toUploadedEvidenceFile(file, kind);
      } catch (error) {
        removeStoredFile(config, file.path);
        throw error;
      }

      const deadline = evidenceDeadline(ctx, match);
      const late = deadline ? isPast(deadline) : false;
      try {
        const info = db
          .prepare(
            `INSERT INTO match_evidence
               (match_id, user_id, kind, original_name, stored_path, size_bytes, sha256, mime, is_late, verified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          )
          .run(
            matchId,
            user.id,
            kind,
            uploaded.originalName,
            uploaded.storedPath,
            uploaded.size,
            uploaded.sha256,
            uploaded.mime,
            late ? 1 : 0,
          );
        const evidenceId = Number(info.lastInsertRowid);
        upsertSubmissionState(ctx, kind, matchId, user.id, evidenceId, late ? 'late' : 'submitted');
        const evidence = db.prepare('SELECT * FROM match_evidence WHERE id = ?').get(evidenceId) as MatchEvidenceRow;
        res.status(200).json({
          ok: true,
          evidence: {
            id: evidence.id,
            matchId: evidence.match_id,
            userId: evidence.user_id,
            kind: evidence.kind,
            originalName: evidence.original_name,
            sizeBytes: evidence.size_bytes,
            sha256: evidence.sha256,
            uploadedAt: evidence.uploaded_at,
            isLate: evidence.is_late === 1,
          },
          state: late ? 'late' : 'submitted',
          isLate: late,
          deadline,
        });
      } catch (error) {
        removeStoredFile(config, uploaded.storedPath);
        throw error;
      }
    });

  router.post(
    '/matches/:id/evidence/log',
    requireAuth,
    uploadRateLimit,
    ensureParticipant(ctx),
    logUploader.single('file'),
    uploadHandler('latest_log'),
  );

  router.post(
    '/matches/:id/evidence/replay',
    requireAuth,
    uploadRateLimit,
    ensureParticipant(ctx),
    replayUploader.single('file'),
    uploadHandler('replay'),
  );

  router.get('/me/matches/:id/evidence', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const matchId = parseId(req.params.id, '比赛 ID');
    const match = loadMatch(ctx, matchId);
    if (!isParticipant(ctx, matchId, user.id)) throw errors.forbidden('仅本场参赛玩家可查看');
    const deadline = evidenceDeadline(ctx, match);
    const getState = (kind: EvidenceKind, table: string) => {
      const row = db
        .prepare(
          `SELECT t.state, t.submitted_at, t.evidence_id, e.original_name, e.size_bytes, e.sha256, e.uploaded_at, e.is_late
           FROM ${table} t LEFT JOIN match_evidence e ON e.id = t.evidence_id
           WHERE t.match_id = ? AND t.user_id = ?`,
        )
        .get(matchId, user.id) as
        | {
            state: string;
            submitted_at: string | null;
            evidence_id: number | null;
            original_name: string | null;
            size_bytes: number | null;
            sha256: string | null;
            uploaded_at: string | null;
            is_late: number | null;
          }
        | undefined;
      return {
        state: row?.state ?? 'missing',
        submittedAt: row?.submitted_at ?? null,
        isLate: row?.is_late === 1,
        evidenceId: row?.evidence_id ?? null,
        originalName: row?.original_name ?? null,
        sizeBytes: row?.size_bytes ?? null,
        sha256: row?.sha256 ?? null,
        uploadedAt: row?.uploaded_at ?? null,
        downloadUrl: row?.evidence_id
          ? `/api/me/matches/${matchId}/evidence/${row.evidence_id}/download`
          : null,
        kind,
      };
    };
    res.status(200).json({
      matchId,
      deadline,
      deadlinePassed: deadline ? isPast(deadline) : false,
      logs: getState('latest_log', 'match_logs'),
      replay: getState('replay', 'match_replays'),
    });
  });

  // 本人下载自己的证据（管理员下载走 /admin/matches/:id/evidence/:evidenceId/download）
  router.get('/me/matches/:matchId/evidence/:evidenceId/download', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const matchId = parseId(req.params.matchId, '比赛 ID');
    const evidenceId = parseId(req.params.evidenceId, '证据 ID');
    const evidence = db.prepare('SELECT * FROM match_evidence WHERE id = ? AND match_id = ?').get(
      evidenceId,
      matchId,
    ) as MatchEvidenceRow | undefined;
    if (!evidence) throw errors.notFound('证据不存在');
    if (evidence.user_id !== user.id && (req.auth?.level ?? 0) < 1) {
      throw errors.forbidden('只能下载自己提交的证据');
    }
    writeAudit(db, {
      actorUserId: user.id,
      actorXuanjianId: user.xuanjian_user_id,
      action: 'evidence.download',
      targetType: 'match_evidence',
      targetId: evidence.id,
      after: { matchId, kind: evidence.kind },
      ip: req.ip ?? null,
    });
    sendEvidenceFile(ctx, res, evidence);
  });

  return router;
}
