import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app.js';
import type {
  MatchEvidenceRow,
  MatchRow,
  RankTierRow,
  SeasonRow,
  ServerRow,
  UserRow,
} from '../../db/models.js';
import { auditFromRequest, queryAuditLogs } from '../../lib/audit.js';
import { encryptString, randomHex, sha256Hex } from '../../lib/crypto.js';
import { errors } from '../../lib/errors.js';
import { adjustPoints, listPointTransactions } from '../../lib/settlement.js';
import { getSeasonLeaderboard } from '../../lib/leaderboard.js';
import { sendMail } from '../../lib/mailer.js';
import { listResponse, parseId, parsePagination } from '../../lib/pagination.js';
import { auditPublic, publicUser, rankTierPublic } from '../../lib/serialize.js';
import { getCurrentSeason, getSeason } from '../../lib/season.js';
import {
  describeSmtpSettings,
  getSetting,
  getSmtpSettings,
  saveSmtpSettings,
  setSetting,
} from '../../lib/settings.js';
import { listRankTiers } from '../../lib/tiers.js';
import { removeStoredFile, storageStatsFromRows } from '../../lib/storage.js';
import { nowIso } from '../../lib/time.js';
import { requireSuper } from '../../middleware/auth.js';

const SETTINGS_WHITELIST = new Set([
  'site_name',
  'registration_need_email',
  'evidence_deadline_minutes',
  'appeal_deadline_hours',
  'team_create_enabled',
  'team_min_members',
  'team_max_members',
  'upload_max_latest_log_mb',
  'upload_max_mcpr_mb',
  // 非敏感 SMTP 键可通过通用设置接口更新（密码仍走 /admin/settings/smtp）
  'smtp_host',
  'smtp_port',
  'smtp_secure',
  'smtp_user',
  'smtp_from_name',
  'smtp_from_email',
]);

const smtpSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(255).optional(),
  pass: z.string().max(255).optional(),
  fromName: z.string().trim().max(100).optional(),
  fromEmail: z.string().trim().email().max(255).optional(),
});

export function createSystemAdminRouter(ctx: AppContext): Router {
  const { db, config } = ctx;
  const router = Router();

  // ========== 用户管理 ==========
  router.get('/users', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeof req.query.query === 'string' && req.query.query.trim()) {
      const q = `%${req.query.query.trim()}%`;
      conditions.push('(u.nickname LIKE ? OR u.username LIKE ? OR u.game_id LIKE ? OR u.xuanjian_user_id LIKE ? OR u.email LIKE ?)');
      params.push(q, q, q, q, q);
    }
    if (typeof req.query.level === 'string' && req.query.level !== '') {
      conditions.push('u.level = ?');
      params.push(Number.parseInt(req.query.level, 10));
    }
    if (typeof req.query.status === 'string' && req.query.status) {
      conditions.push('u.status = ?');
      params.push(req.query.status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...params) as { c: number }
    ).c;
    const rows = db
      .prepare(`SELECT u.* FROM users u ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`)
      .all(...params, pagination.limit, pagination.offset) as UserRow[];
    res.status(200).json(
      listResponse(
        rows.map((user) => ({
          ...publicUser(user, { includePrivate: true }),
          registeredSeasons: (
            db.prepare('SELECT COUNT(*) AS c FROM registrations WHERE user_id = ?').get(user.id) as {
              c: number;
            }
          ).c,
        })),
        total,
        pagination,
      ),
    );
  });

  router.patch('/users/:id', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(parseId(req.params.id, '用户 ID')) as
      | UserRow
      | undefined;
    if (!user) throw errors.notFound('用户不存在');
    const body = z
      .object({
        status: z.enum(['active', 'disabled']),
        reason: z.string().max(500).optional(),
      })
      .parse(req.body);
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(body.status, nowIso(), user.id);
    if (body.status === 'disabled') {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    }
    auditFromRequest(db, req, {
      action: 'user.status',
      targetType: 'user',
      targetId: user.id,
      before: { status: user.status },
      after: { status: body.status },
      reason: body.reason ?? null,
    });
    res.status(200).json({ ok: true, userId: user.id, status: body.status });
  });

  // ========== 积分 / 排行榜 ==========
  router.get('/points', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const seasonId = Number.parseInt(String(req.query.seasonId ?? ''), 10);
    const userId = Number.parseInt(String(req.query.userId ?? ''), 10);
    const result = listPointTransactions(db, {
      seasonId: Number.isFinite(seasonId) ? seasonId : undefined,
      userId: Number.isFinite(userId) ? userId : undefined,
      pageSize: pagination.limit,
      offset: pagination.offset,
    });
    res.status(200).json(
      listResponse(
        result.rows.map((row) => ({
          id: row.id,
          seasonId: row.season_id,
          userId: row.user_id,
          nickname: row.nickname,
          matchId: row.match_id,
          delta: row.delta,
          reason: row.reason,
          balanceAfter: row.balance_after,
          note: row.note,
          createdAt: row.created_at,
        })),
        result.total,
        pagination,
      ),
    );
  });

  router.post('/points/adjust', requireSuper, (req, res) => {
    const body = z
      .object({
        seasonId: z.number().int().positive(),
        userId: z.number().int().positive(),
        delta: z.number().int().min(-10000).max(10000).refine((value) => value !== 0, 'delta 不能为 0'),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(req.body);
    const result = adjustPoints(db, {
      seasonId: body.seasonId,
      userId: body.userId,
      delta: body.delta,
      reason: body.reason,
      reviewer: req.auth!.user,
      ip: req.ip ?? null,
    });
    res.status(200).json({ ok: true, ...result });
  });

  router.get('/leaderboard', (req, res) => {
    const seasonId = Number.parseInt(String(req.query.seasonId ?? ''), 10);
    const season = Number.isFinite(seasonId) ? getSeason(db, seasonId) : getCurrentSeason(db);
    if (!season) throw errors.notFound('赛季不存在');
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 50 });
    const result = getSeasonLeaderboard(db, season.id, pagination, { includeZeroMatches: true });
    res.status(200).json({
      ...listResponse(result.items, result.total, pagination),
      seasonId: season.id,
      seasonName: season.name,
      state: season.state,
    });
  });

  // ========== 段位配置（★） ==========
  router.get('/rank-tiers', requireSuper, (req, res) => {
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const seasonId = Number.parseInt(String(req.query.seasonId ?? ''), 10);
    const items = listRankTiers(db, {
      kind,
      seasonId: Number.isFinite(seasonId) ? seasonId : undefined,
    });
    res.status(200).json({ items: items.map(rankTierPublic), total: items.length });
  });

  router.patch('/rank-tiers', requireSuper, (req, res) => {
    const body = z
      .object({
        id: z.number().int().positive().optional(),
        kind: z.enum(['season', 'lifetime']).optional(),
        seasonId: z.number().int().positive().nullish(),
        name: z.string().trim().min(1).max(50).optional(),
        minPoints: z.number().int().min(0).optional(),
        color: z.string().trim().max(32).optional(),
        icon: z.string().trim().max(255).nullish(),
        sortOrder: z.number().int().optional(),
        deleted: z.boolean().optional(),
      })
      .parse(req.body);

    if (body.deleted) {
      if (!body.id) throw errors.invalidRequest('删除段位需要 id');
      const tier = db.prepare('SELECT * FROM rank_tiers WHERE id = ?').get(body.id) as
        | RankTierRow
        | undefined;
      if (!tier) throw errors.notFound('段位不存在');
      db.prepare('DELETE FROM rank_tiers WHERE id = ?').run(tier.id);
      auditFromRequest(db, req, {
        action: 'rank_tier.delete',
        targetType: 'rank_tier',
        targetId: tier.id,
        before: rankTierPublic(tier),
        reason: '删除段位配置（历史 rank_history 保留）',
      });
      res.status(200).json({ ok: true, deleted: tier.id });
      return;
    }

    if (body.id) {
      const tier = db.prepare('SELECT * FROM rank_tiers WHERE id = ?').get(body.id) as
        | RankTierRow
        | undefined;
      if (!tier) throw errors.notFound('段位不存在');
      db.prepare(
        `UPDATE rank_tiers SET
           kind = COALESCE(?, kind), season_id = ?,
           name = COALESCE(?, name), min_points = COALESCE(?, min_points),
           color = COALESCE(?, color), icon = COALESCE(?, icon),
           sort_order = COALESCE(?, sort_order)
         WHERE id = ?`,
      ).run(
        body.kind ?? null,
        body.seasonId === undefined ? tier.season_id : body.seasonId,
        body.name ?? null,
        body.minPoints ?? null,
        body.color ?? null,
        body.icon === undefined ? tier.icon : body.icon,
        body.sortOrder ?? null,
        tier.id,
      );
      const updated = db.prepare('SELECT * FROM rank_tiers WHERE id = ?').get(tier.id) as RankTierRow;
      auditFromRequest(db, req, {
        action: 'rank_tier.update',
        targetType: 'rank_tier',
        targetId: tier.id,
        before: rankTierPublic(tier),
        after: rankTierPublic(updated),
      });
      res.status(200).json(rankTierPublic(updated));
      return;
    }

    if (!body.kind || !body.name || body.minPoints === undefined) {
      throw errors.invalidRequest('新建段位需要 kind / name / minPoints');
    }
    const info = db
      .prepare(
        `INSERT INTO rank_tiers (kind, season_id, name, min_points, color, icon, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.kind,
        body.seasonId ?? null,
        body.name,
        body.minPoints,
        body.color ?? '#8b5cf6',
        body.icon ?? null,
        body.sortOrder ?? 0,
      );
    const created = db
      .prepare('SELECT * FROM rank_tiers WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as RankTierRow;
    auditFromRequest(db, req, {
      action: 'rank_tier.create',
      targetType: 'rank_tier',
      targetId: created.id,
      after: rankTierPublic(created),
    });
    res.status(200).json(rankTierPublic(created));
  });

  router.delete('/rank-tiers/:id', requireSuper, (req, res) => {
    const tier = db
      .prepare('SELECT * FROM rank_tiers WHERE id = ?')
      .get(parseId(req.params.id, '段位 ID')) as RankTierRow | undefined;
    if (!tier) throw errors.notFound('段位不存在');
    db.prepare('DELETE FROM rank_tiers WHERE id = ?').run(tier.id);
    auditFromRequest(db, req, {
      action: 'rank_tier.delete',
      targetType: 'rank_tier',
      targetId: tier.id,
      before: rankTierPublic(tier),
      reason: '删除段位配置（历史 rank_history 保留）',
    });
    res.status(200).json({ ok: true, deleted: tier.id });
  });

  // ========== 系统设置（★） ==========
  router.get('/settings', requireSuper, (_req, res) => {
    const rows = db
      .prepare('SELECT key, value, is_secret, updated_at FROM system_settings ORDER BY key')
      .all() as Array<{ key: string; value: string; is_secret: number; updated_at: string }>;
    const settings: Record<string, string> = {};
    const items = rows.map((row) => {
      const masked = row.is_secret === 1;
      if (!masked) settings[row.key] = row.value;
      return {
        key: row.key,
        // 敏感值统一脱敏为 ***，PUT 时回传 *** 表示不修改
        value: masked ? '***' : row.value,
        isSecret: masked,
        updatedAt: row.updated_at,
      };
    });
    res.status(200).json({ items, settings });
  });

  router.put('/settings', requireSuper, (req, res) => {
    const body = z
      .object({
        items: z.array(z.object({ key: z.string().trim().min(1), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
        settings: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      })
      .refine((value) => value.items !== undefined || value.settings !== undefined, {
        message: '需要 items 或 settings',
      })
      .parse(req.body);
    const entries: Array<{ key: string; value: string }> = [];
    if (body.items) {
      for (const item of body.items) entries.push({ key: item.key, value: String(item.value) });
    }
    if (body.settings) {
      for (const [key, value] of Object.entries(body.settings)) {
        entries.push({ key, value: String(value) });
      }
    }
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    let updated = 0;
    db.transaction(() => {
      for (const entry of entries) {
        // 敏感值回传 *** 表示保持不变
        if (entry.value === '***') continue;
        if (!SETTINGS_WHITELIST.has(entry.key)) {
          throw errors.invalidRequest(`不允许通过该接口修改设置键：${entry.key}`, {
            allowed: Array.from(SETTINGS_WHITELIST),
          });
        }
        before[entry.key] = getSetting(db, entry.key) ?? '';
        setSetting(db, entry.key, entry.value, { updatedBy: req.auth!.user.id });
        after[entry.key] = entry.value;
        updated += 1;
      }
    })();
    auditFromRequest(db, req, {
      action: 'settings.update',
      targetType: 'system_settings',
      targetId: null,
      before,
      after,
    });
    res.status(200).json({ ok: true, updated });
  });

  // ========== SMTP（★） ==========
  router.get('/settings/smtp', requireSuper, (_req, res) => {
    res.status(200).json(describeSmtpSettings(db, config));
  });

  router.put('/settings/smtp', requireSuper, (req, res) => {
    const body = smtpSchema.parse(req.body);
    saveSmtpSettings(db, config, body, req.auth!.user.id);
    auditFromRequest(db, req, {
      action: 'settings.smtp',
      targetType: 'system_settings',
      targetId: null,
      after: { host: body.host, port: body.port, secure: body.secure, user: body.user ?? null },
    });
    res.status(200).json(describeSmtpSettings(db, config));
  });

  router.post('/settings/smtp/test', requireSuper, async (req, res, next) => {
    try {
      const body = z.object({ to: z.string().trim().email().max(255).optional() }).parse(req.body ?? {});
      const smtp = getSmtpSettings(db, config);
      if (!smtp) throw errors.notConfigured('SMTP 尚未配置');
      const to = body.to ?? req.auth!.user.email ?? smtp.fromEmail;
      if (!to) throw errors.invalidRequest('缺少收件人');
      const result = await sendMail(db, config, {
        to,
        subject: '【XBed】SMTP 测试邮件',
        text: '如果你收到这封邮件，说明 XBed 邮件配置可用。',
        html: '<p>如果你收到这封邮件，说明 <strong>XBed</strong> 邮件配置可用。</p>',
        template: 'smtp_test',
        userId: req.auth!.user.id,
      });
      res.status(200).json({ ok: result.sent, sent: result.sent, error: result.error ?? null, to });
    } catch (error) {
      next(error);
    }
  });

  // ========== 服务器密钥（★） ==========
  router.get('/servers', requireSuper, (_req, res) => {
    const rows = db
      .prepare('SELECT id, server_key, name, state, note, last_seen_at, created_at, rotated_at FROM servers ORDER BY id')
      .all() as Array<Omit<ServerRow, 'secret_hash' | 'secret_enc'>>;
    res.status(200).json({
      items: rows.map((row) => ({
        id: row.id,
        serverKey: row.server_key,
        name: row.name,
        state: row.state,
        note: row.note,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
        rotatedAt: row.rotated_at,
      })),
      total: rows.length,
    });
  });

  router.post('/servers', requireSuper, (req, res) => {
    const body = z
      .object({
        serverKey: z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/),
        name: z.string().trim().min(1).max(100),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);
    const exists = db.prepare('SELECT id FROM servers WHERE server_key = ?').get(body.serverKey);
    if (exists) throw errors.conflict('服务器标识已存在');
    const secret = randomHex(32);
    const info = db
      .prepare(
        `INSERT INTO servers (server_key, name, secret_hash, secret_enc, state, note)
         VALUES (?, ?, ?, ?, 'active', ?)`,
      )
      .run(
        body.serverKey,
        body.name,
        sha256Hex(secret),
        encryptString(secret, config.encryptionKey),
        body.note ?? null,
      );
    const serverId = Number(info.lastInsertRowid);
    auditFromRequest(db, req, {
      action: 'server.create',
      targetType: 'server',
      targetId: serverId,
      after: { serverKey: body.serverKey, name: body.name },
    });
    res.status(200).json({
      ok: true,
      id: serverId,
      serverKey: body.serverKey,
      secret,
      note: '密钥明文仅在本次响应返回一次，请立即保存到插件配置',
    });
  });

  router.post('/servers/:id/rotate', requireSuper, (req, res) => {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(parseId(req.params.id, '服务器 ID')) as
      | ServerRow
      | undefined;
    if (!server) throw errors.notFound('服务器不存在');
    const secret = randomHex(32);
    db.prepare(
      `UPDATE servers SET secret_hash = ?, secret_enc = ?, rotated_at = ? WHERE id = ?`,
    ).run(sha256Hex(secret), encryptString(secret, config.encryptionKey), nowIso(), server.id);
    auditFromRequest(db, req, {
      action: 'server.rotate',
      targetType: 'server',
      targetId: server.id,
      before: { serverKey: server.server_key },
      after: { rotatedAt: nowIso() },
      reason: '轮换 HMAC 密钥',
    });
    res.status(200).json({
      ok: true,
      id: server.id,
      serverKey: server.server_key,
      secret,
      note: '新密钥明文仅在本次响应返回一次；旧密钥立即失效',
    });
  });

  router.post('/servers/:id/revoke', requireSuper, (req, res) => {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(parseId(req.params.id, '服务器 ID')) as
      | ServerRow
      | undefined;
    if (!server) throw errors.notFound('服务器不存在');
    const body = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
    db.prepare("UPDATE servers SET state = 'revoked' WHERE id = ?").run(server.id);
    auditFromRequest(db, req, {
      action: 'server.revoke',
      targetType: 'server',
      targetId: server.id,
      before: { state: server.state },
      after: { state: 'revoked' },
      reason: body.reason ?? null,
    });
    res.status(200).json({ ok: true, id: server.id, state: 'revoked' });
  });

  // ========== 文件管理 ==========
  router.get('/files', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeof req.query.kind === 'string' && req.query.kind) {
      conditions.push('e.kind = ?');
      params.push(req.query.kind);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allRows = db.prepare('SELECT kind, size_bytes FROM match_evidence').all() as Array<{
      kind: string;
      size_bytes: number;
    }>;
    const storage = storageStatsFromRows(allRows);
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM match_evidence e ${where}`).get(...params) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT e.*, u.nickname, u.game_id, m.state AS match_state, m.season_id
         FROM match_evidence e LEFT JOIN users u ON u.id = e.user_id
         LEFT JOIN matches m ON m.id = e.match_id
         ${where} ORDER BY e.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pagination.limit, pagination.offset) as Array<
      MatchEvidenceRow & {
        nickname: string | null;
        game_id: string | null;
        match_state: string | null;
        season_id: number | null;
      }
    >;
    const dbMode = db.pragma('journal_mode', { simple: true });
    res.status(200).json({
      ...listResponse(
        rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          matchId: row.match_id,
          userId: row.user_id,
          nickname: row.nickname,
          gameId: row.game_id,
          originalName: row.original_name,
          sizeBytes: row.size_bytes,
          sha256: row.sha256,
          uploadedAt: row.uploaded_at,
          isLate: row.is_late === 1,
          matchState: row.match_state,
          seasonId: row.season_id,
        })),
        total,
        pagination,
      ),
      storage: {
        ...storage,
        logsBytes: storage.logBytes,
        logsFiles: storage.logCount,
        replaysBytes: storage.replayBytes,
        replaysFiles: storage.replayCount,
      },
      db: { journalMode: String(dbMode), file: config.dbFile },
    });
  });

  router.delete('/files/:id', requireSuper, (req, res) => {
    const evidence = db
      .prepare('SELECT * FROM match_evidence WHERE id = ?')
      .get(parseId(req.params.id, '文件 ID')) as MatchEvidenceRow | undefined;
    if (!evidence) throw errors.notFound('文件不存在');
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(evidence.match_id) as
      | MatchRow
      | undefined;
    const season: SeasonRow | null = match?.season_id ? getSeason(db, match.season_id) : null;
    const allowedByMatch = match ? ['abnormal', 'void'].includes(match.state) : false;
    const allowedBySeason = season ? ['sealed', 'archived'].includes(season.state) : false;
    if (!allowedByMatch && !allowedBySeason) {
      throw errors.conflict('仅允许删除异常/作废比赛或已封存赛季的证据文件');
    }
    const removed = removeStoredFile(config, evidence.stored_path);
    db.transaction(() => {
      db.prepare('DELETE FROM match_evidence WHERE id = ?').run(evidence.id);
      db.prepare('UPDATE match_logs SET evidence_id = NULL WHERE evidence_id = ?').run(evidence.id);
      db.prepare('UPDATE match_replays SET evidence_id = NULL WHERE evidence_id = ?').run(evidence.id);
    })();
    auditFromRequest(db, req, {
      action: 'file.delete',
      targetType: 'match_evidence',
      targetId: evidence.id,
      before: {
        matchId: evidence.match_id,
        kind: evidence.kind,
        originalName: evidence.original_name,
        sizeBytes: evidence.size_bytes,
        sha256: evidence.sha256,
        path: evidence.stored_path,
      },
      reason: '管理后台删除证据文件',
    });
    res.status(200).json({ ok: true, id: evidence.id, fileRemoved: removed });
  });

  router.post('/files/cleanup-replays', requireSuper, (req, res) => {
    const body = z.object({ seasonId: z.number().int().positive().optional() }).parse(req.body ?? {});
    const seasons = body.seasonId
      ? [getSeason(db, body.seasonId)].filter((season): season is SeasonRow => Boolean(season))
      : (db.prepare("SELECT * FROM seasons WHERE state IN ('sealed','archived')").all() as SeasonRow[]);
    if (seasons.length === 0) throw errors.notFound('没有已封存的赛季可清理');
    for (const season of seasons) {
      if (!['sealed', 'archived'].includes(season.state)) {
        throw errors.conflict(`赛季 ${season.code} 尚未封存，禁止清理 .mcpr`);
      }
    }
    const seasonIds = seasons.map((season) => season.id);
    const placeholders = seasonIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT e.* FROM match_evidence e JOIN matches m ON m.id = e.match_id
         WHERE e.kind = 'replay' AND m.season_id IN (${placeholders})`,
      )
      .all(...seasonIds) as MatchEvidenceRow[];
    let removedFiles = 0;
    let removedBytes = 0;
    db.transaction(() => {
      for (const row of rows) {
        if (removeStoredFile(config, row.stored_path)) removedFiles += 1;
        removedBytes += row.size_bytes;
        db.prepare('DELETE FROM match_evidence WHERE id = ?').run(row.id);
        db.prepare('UPDATE match_replays SET evidence_id = NULL WHERE evidence_id = ?').run(row.id);
      }
    })();
    auditFromRequest(db, req, {
      action: 'file.cleanup_replays',
      targetType: 'match_evidence',
      targetId: null,
      after: {
        seasonIds,
        removedFiles,
        removedBytes,
        candidates: rows.length,
        executedAt: nowIso(),
      },
      reason: '清理已封存赛季的 .mcpr 回放',
    });
    res.status(200).json({
      ok: true,
      seasonIds,
      removedFiles,
      removedBytes,
      candidates: rows.length,
      executedAt: nowIso(),
    });
  });

  // ========== 审计日志（只读，仅超级管理员） ==========
  router.get('/audit', requireSuper, (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 50 });
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const targetType = typeof req.query.targetType === 'string' ? req.query.targetType : undefined;
    const result = queryAuditLogs(db, {
      action,
      targetType,
      page: pagination.page,
      pageSize: pagination.limit,
      offset: pagination.offset,
    });
    const nicknames = new Map<number, string>();
    const ids = Array.from(
      new Set(result.items.map((row) => row.actor_user_id).filter((id): id is number => typeof id === 'number')),
    );
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const users = db
        .prepare(`SELECT id, nickname FROM users WHERE id IN (${placeholders})`)
        .all(...ids) as Array<{ id: number; nickname: string }>;
      for (const user of users) nicknames.set(user.id, user.nickname);
    }
    res.status(200).json(
      listResponse(
        result.items.map((row) => auditPublic(row, row.actor_user_id ? nicknames.get(row.actor_user_id) : null)),
        result.total,
        pagination,
      ),
    );
  });

  return router;
}
