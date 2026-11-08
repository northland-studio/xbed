import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app.js';
import type {
  MatchEventRow,
  MatchEvidenceRow,
  MatchPlayerRow,
  MatchResultRow,
  MatchRow,
  SeasonRow,
} from '../../db/models.js';
import { auditFromRequest } from '../../lib/audit.js';
import { errors } from '../../lib/errors.js';
import { parseId, parsePagination } from '../../lib/pagination.js';
import {
  matchEventPublic,
  matchPublic,
  matchResultPublic,
  parseJson,
} from '../../lib/serialize.js';
import { getSeason } from '../../lib/season.js';
import { reviewMatch, type ReviewAction } from '../../lib/settlement.js';
import { pipeEvidenceFile } from '../../lib/storage.js';

const correctedPlayerSchema = z
  .object({
    userId: z.number().int().positive().nullish(),
    gameId: z.string().trim().min(1).max(32).optional(),
    team: z.string().max(64).nullish(),
    isWinner: z.boolean().optional(),
    placement: z.number().int().nullish(),
    kills: z.number().int().min(0).optional(),
    finalKills: z.number().int().min(0).optional(),
    deaths: z.number().int().min(0).optional(),
    finalDeaths: z.number().int().min(0).optional(),
    bedsBroken: z.number().int().min(0).optional(),
  })
  .passthrough();

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'correct', 'abnormal', 'resolve', 'void']),
  reason: z.string().max(2000).nullish(),
  corrected: z
    .union([
      z.array(correctedPlayerSchema),
      z.object({
        players: z.array(correctedPlayerSchema).optional(),
        winnerTeam: z.string().max(64).nullish(),
        correctedWinnerTeam: z.string().max(64).nullish(),
        isDraw: z.boolean().optional(),
      }),
    ])
    .nullish(),
  correctedWinnerTeam: z.string().max(64).nullish().optional(),
  isDraw: z.boolean().optional(),
});

function normalizeCorrected(
  body: z.infer<typeof reviewSchema>,
): { players?: Array<z.infer<typeof correctedPlayerSchema>>; winnerTeam?: string | null; isDraw?: boolean } | null {
  if (!body.corrected && body.correctedWinnerTeam === undefined && body.isDraw === undefined) return null;
  if (Array.isArray(body.corrected)) {
    return {
      players: body.corrected,
      winnerTeam: body.correctedWinnerTeam,
      isDraw: body.isDraw,
    };
  }
  if (body.corrected && !Array.isArray(body.corrected)) {
    return {
      players: body.corrected.players,
      winnerTeam:
        body.corrected.winnerTeam !== undefined
          ? body.corrected.winnerTeam
          : body.corrected.correctedWinnerTeam !== undefined
            ? body.corrected.correctedWinnerTeam
            : body.correctedWinnerTeam,
      isDraw: body.corrected.isDraw !== undefined ? body.corrected.isDraw : body.isDraw,
    };
  }
  return { players: [], winnerTeam: body.correctedWinnerTeam, isDraw: body.isDraw };
}

export function createMatchesAdminRouter(ctx: AppContext): Router {
  const { db, config } = ctx;
  const router = Router();

  router.get('/matches', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeof req.query.state === 'string' && req.query.state) {
      conditions.push('m.state = ?');
      params.push(req.query.state);
    }
    if (typeof req.query.seasonId === 'string' && req.query.seasonId) {
      conditions.push('m.season_id = ?');
      params.push(Number.parseInt(req.query.seasonId, 10));
    }
    if (typeof req.query.q === 'string' && req.query.q) {
      conditions.push('(m.arena_display LIKE ? OR m.external_match_id LIKE ?)');
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM matches m ${where}`).get(...params) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT m.* FROM matches m ${where}
         ORDER BY CASE m.state WHEN 'pending' THEN 0 WHEN 'in_review' THEN 1 WHEN 'abnormal' THEN 2 ELSE 3 END,
                  COALESCE(m.ended_at, m.created_at) DESC, m.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pagination.limit, pagination.offset) as MatchRow[];
    const items = rows.map((row) => {
      const season = row.season_id ? getSeason(db, row.season_id) : null;
      const playerCount = (
        db.prepare('SELECT COUNT(*) AS c FROM match_players WHERE match_id = ?').get(row.id) as { c: number }
      ).c;
      const evidenceCount = (
        db.prepare('SELECT COUNT(*) AS c FROM match_evidence WHERE match_id = ?').get(row.id) as { c: number }
      ).c;
      return {
        ...matchPublic(row, {
          season: season ? { id: season.id, name: season.name, code: season.code } : null,
          hasResult: Boolean(db.prepare('SELECT id FROM match_results WHERE match_id = ?').get(row.id)),
        }),
        playerCount,
        evidenceCount,
      };
    });
    res.status(200).json({ items, total, page: pagination.page, pageSize: pagination.pageSize });
  });

  router.get('/matches/:id', (req, res) => {
    const matchId = parseId(req.params.id, '比赛 ID');
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined;
    if (!match) throw errors.notFound('比赛不存在');
    const season = match.season_id ? (getSeason(db, match.season_id) as SeasonRow | null) : null;
    const players = db
      .prepare('SELECT * FROM match_players WHERE match_id = ? ORDER BY COALESCE(placement, 99), id')
      .all(matchId) as MatchPlayerRow[];
    const events = db
      .prepare('SELECT * FROM match_events WHERE match_id = ? ORDER BY (at IS NULL), at, id')
      .all(matchId) as MatchEventRow[];
    const nicknameById = new Map<number, string>();
    for (const player of players) {
      if (!player.user_id) continue;
      const user = db.prepare('SELECT nickname, game_id FROM users WHERE id = ?').get(player.user_id) as
        | { nickname: string; game_id: string | null }
        | undefined;
      if (user) nicknameById.set(player.user_id, user.nickname);
    }
    const rawRow = db
      .prepare('SELECT * FROM match_raw_data WHERE match_id = ? ORDER BY id DESC LIMIT 1')
      .get(matchId) as
      | { payload: string; payload_hash: string; schema_version: number; received_at: string }
      | undefined;

    const evidenceRows = db
      .prepare('SELECT * FROM match_evidence WHERE match_id = ? ORDER BY id ASC')
      .all(matchId) as MatchEvidenceRow[];
    const evidence = evidenceRows.map((row) => {
      const user = row.user_id
        ? (db.prepare('SELECT nickname, username, game_id FROM users WHERE id = ?').get(row.user_id) as
            | { nickname: string; username: string; game_id: string | null }
            | undefined)
        : undefined;
      return {
        id: row.id,
        userId: row.user_id,
        gameId: user?.game_id ?? null,
        nickname: user?.nickname ?? null,
        username: user?.username ?? null,
        kind: row.kind,
        originalName: row.original_name,
        sizeBytes: row.size_bytes,
        sha256: row.sha256,
        uploadedAt: row.uploaded_at,
        isLate: row.is_late === 1,
        state: row.is_late === 1 ? 'late' : 'submitted',
      };
    });

    const reviews = (
      db
        .prepare(
          `SELECT r.*, u.nickname FROM match_reviews r LEFT JOIN users u ON u.id = r.reviewer_id
           WHERE r.match_id = ? ORDER BY r.id DESC`,
        )
        .all(matchId) as Array<{
        id: number;
        reviewer_id: number;
        nickname: string | null;
        action: string;
        reason: string | null;
        before_state: string | null;
        after_state: string | null;
        created_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      reviewerId: row.reviewer_id,
      reviewerNickname: row.nickname,
      action: row.action,
      reason: row.reason,
      beforeState: row.before_state,
      afterState: row.after_state,
      createdAt: row.created_at,
    }));

    const resultVersions = (
      db
        .prepare(
          `SELECT v.*, u.nickname FROM match_result_versions v LEFT JOIN users u ON u.id = v.changed_by
           WHERE v.match_id = ? ORDER BY v.version ASC`,
        )
        .all(matchId) as Array<{
        version: number;
        before_json: string | null;
        after_json: string;
        reason: string | null;
        changed_by: number | null;
        nickname: string | null;
        created_at: string;
      }>
    ).map((row) => ({
      version: row.version,
      before: parseJson<unknown>(row.before_json, null),
      after: parseJson<unknown>(row.after_json, null),
      reason: row.reason,
      changedBy: row.changed_by,
      changedByNickname: row.nickname,
      createdAt: row.created_at,
    }));

    const resultRow = db.prepare('SELECT * FROM match_results WHERE match_id = ?').get(matchId) as
      | MatchResultRow
      | undefined;

    const submissionRows = (table: string) =>
      db
        .prepare(
          `SELECT t.*, u.nickname, u.game_id FROM ${table} t LEFT JOIN users u ON u.id = t.user_id
           WHERE t.match_id = ? ORDER BY t.user_id`,
        )
        .all(matchId) as Array<{
        user_id: number;
        state: string;
        submitted_at: string | null;
        evidence_id: number | null;
        nickname: string | null;
        game_id: string | null;
      }>;

    const warnings: string[] = [];
    if (!rawRow) warnings.push('缺少服务器原始数据');
    if (match.abnormal_reason) warnings.push(`插件标记异常：${match.abnormal_reason}`);
    const logRows = submissionRows('match_logs');
    const replayRows = submissionRows('match_replays');
    const missingLogs = logRows.filter((row) => row.state === 'missing');
    if (missingLogs.length > 0) {
      warnings.push(`${missingLogs.length} 名玩家未提交 latest.log：${missingLogs.map((row) => row.nickname ?? row.user_id).join('、')}`);
    }
    const missingReplays = replayRows.filter((row) => row.state === 'missing');
    if (missingReplays.length > 0) {
      warnings.push(`${missingReplays.length} 名玩家未提交 .mcpr 回放`);
    }
    if (evidenceRows.length === 0) warnings.push('暂无任何玩家证据文件');

    const base = matchPublic(match, {
      players,
      events,
      nicknames: nicknameById,
      season: season ? { id: season.id, name: season.name, code: season.code } : null,
      hasResult: Boolean(resultRow),
    });

    res.status(200).json({
      ...base,
      rawData: rawRow
        ? {
            payload: parseJson<unknown>(rawRow.payload, null),
            payloadHash: rawRow.payload_hash,
            schemaVersion: rawRow.schema_version,
            receivedAt: rawRow.received_at,
          }
        : null,
      evidence,
      reviews,
      resultVersions,
      result: resultRow ? matchResultPublic(resultRow) : null,
      logs: logRows.map((row) => ({
        userId: row.user_id,
        nickname: row.nickname,
        gameId: row.game_id,
        state: row.state,
        submittedAt: row.submitted_at,
        evidenceId: row.evidence_id,
      })),
      replays: replayRows.map((row) => ({
        userId: row.user_id,
        nickname: row.nickname,
        gameId: row.game_id,
        state: row.state,
        submittedAt: row.submitted_at,
        evidenceId: row.evidence_id,
      })),
      warnings,
    });
  });

  // 指定/修正比赛归属赛季（用于 no_season 异常的比赛）
  router.post('/matches/:id/season', (req, res) => {
    const matchId = parseId(req.params.id, '比赛 ID');
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined;
    if (!match) throw errors.notFound('比赛不存在');
    const body = z.object({ seasonId: z.number().int().positive(), reason: z.string().max(500).optional() }).parse(req.body);
    const season = getSeason(db, body.seasonId);
    if (!season) throw errors.notFound('赛季不存在');
    const before = { seasonId: match.season_id, state: match.state, abnormalReason: match.abnormal_reason };
    const clearNoSeason = match.abnormal_reason === 'no_season';
    db.prepare(
      `UPDATE matches SET season_id = ?, state = ?, abnormal_reason = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      season.id,
      clearNoSeason ? 'pending' : match.state,
      clearNoSeason ? null : match.abnormal_reason,
      new Date().toISOString(),
      match.id,
    );
    // 归属赛季后重新关联玩家（只关联比赛开始前已完成报名的玩家）
    db.prepare(
      `UPDATE match_players SET user_id = (
         SELECT u.id FROM users u
           JOIN registrations r
             ON r.user_id = u.id AND r.season_id = ? AND r.state = 'active'
          WHERE lower(u.game_id) = lower(match_players.game_id)
            AND u.status = 'active'
            AND r.created_at <= ?
          LIMIT 1)
       WHERE match_id = ? AND user_id IS NULL`,
    ).run(season.id, match.started_at ?? new Date().toISOString(), match.id);
    auditFromRequest(db, req, {
      action: 'match.assign_season',
      targetType: 'match',
      targetId: match.id,
      before,
      after: { seasonId: season.id, state: clearNoSeason ? 'pending' : match.state },
      reason: body.reason ?? '管理员指定比赛所属赛季',
    });
    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id) as MatchRow;
    res.status(200).json({
      ok: true,
      matchId: match.id,
      seasonId: updated.season_id,
      state: updated.state,
    });
  });

  router.post('/matches/:id/review', (req, res) => {
    const matchId = parseId(req.params.id, '比赛 ID');
    const body = reviewSchema.parse(req.body);
    const corrected = normalizeCorrected(body);
    const output = reviewMatch(db, {
      matchId,
      reviewer: req.auth!.user,
      action: body.action as ReviewAction,
      reason: body.reason ?? null,
      corrected: corrected
        ? {
            players: corrected.players as Array<Record<string, unknown>> | undefined,
            winnerTeam: corrected.winnerTeam,
            isDraw: corrected.isDraw,
          }
        : null,
      ip: req.ip ?? null,
    });    res.status(200).json({
      ok: true,
      matchId,
      action: output.action,
      beforeState: output.beforeState,
      afterState: output.afterState,
      state: output.match.state,
      version: output.version,
      result: output.result ? matchResultPublic(output.result) : null,
    });
  });

  router.get('/matches/:id/evidence/:evidenceId/download', (req, res) => {
    const matchId = parseId(req.params.id, '比赛 ID');
    const evidenceId = parseId(req.params.evidenceId, '证据 ID');
    const evidence = db
      .prepare('SELECT * FROM match_evidence WHERE id = ? AND match_id = ?')
      .get(evidenceId, matchId) as MatchEvidenceRow | undefined;
    if (!evidence) throw errors.notFound('证据不存在');
    auditFromRequest(db, req, {
      action: 'evidence.download',
      targetType: 'match_evidence',
      targetId: evidence.id,
      after: { matchId, kind: evidence.kind, userId: evidence.user_id },
    });
    pipeEvidenceFile(config, res, evidence);
  });

  router.get('/matches/:id/events', (req, res) => {
    const matchId = parseId(req.params.id, '比赛 ID');
    const events = db
      .prepare('SELECT * FROM match_events WHERE match_id = ? ORDER BY (at IS NULL), at, id')
      .all(matchId) as MatchEventRow[];
    res.status(200).json({ items: events.map(matchEventPublic), total: events.length });
  });

  return router;
}
