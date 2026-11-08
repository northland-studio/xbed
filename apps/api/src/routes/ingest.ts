import express, { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import type { MatchRow, SeasonRow, ServerRow, UserRow } from '../db/models.js';
import { writeAudit } from '../lib/audit.js';
import { decryptString, hmacSha256Hex, sha256Hex, timingSafeEqualHex } from '../lib/crypto.js';
import { errors } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';
import { rateLimit } from '../middleware/rateLimit.js';

const MAX_CLOCK_SKEW_SECONDS = 300;

/**
 * 按 match.startedAt 自动匹配赛季：state='running' 且 startedAt ∈ [start_at, end_at]
 * （start_at/end_at 为空视为不限）。匹配不到则 season_id=NULL 并标记 abnormal(no_season)。
 */
export function matchSeasonByStartAt(db: AppContext['db'], startedAt: string | null | undefined): SeasonRow | null {
  if (!startedAt) return null;
  const startTime = Date.parse(startedAt);
  if (!Number.isFinite(startTime)) return null;
  const running = db
    .prepare("SELECT * FROM seasons WHERE state = 'running' ORDER BY COALESCE(start_at, created_at) DESC, id DESC")
    .all() as SeasonRow[];
  for (const season of running) {
    if (season.start_at && Date.parse(season.start_at) > startTime) continue;
    if (season.end_at && Date.parse(season.end_at) < startTime) continue;
    return season;
  }
  return null;
}

const playerSchema = z
  .object({
    uuid: z.string().max(64).nullish(),
    gameId: z.string().trim().min(1).max(32),
    team: z.string().max(64).nullish(),
    isWinner: z.boolean().optional().default(false),
    kills: z.number().int().min(0).optional().default(0),
    finalKills: z.number().int().min(0).optional().default(0),
    deaths: z.number().int().min(0).optional().default(0),
    finalDeaths: z.number().int().min(0).optional().default(0),
    bedsBroken: z.number().int().min(0).optional().default(0),
    placement: z.number().int().nullish(),
  })
  .passthrough();

const eventSchema = z
  .object({
    type: z.string().trim().min(1).max(64),
    at: z.string().nullish(),
    actor: z.string().nullish(),
    target: z.string().nullish(),
    team: z.string().nullish(),
  })
  .passthrough();

const ingestMatchSchema = z
  .object({
    schemaVersion: z.number().int().min(1).optional().default(1),
    matchId: z.string().trim().min(8).max(128),
    arena: z.string().max(128).nullish(),
    arenaDisplay: z.string().max(128).nullish(),
    mode: z.string().max(64).nullish(),
    startedAt: z.string().nullish(),
    endedAt: z.string().nullish(),
    endReason: z.string().max(128).nullish(),
    winnerTeam: z.string().max(64).nullish(),
    isDraw: z.boolean().optional().default(false),
    abnormal: z.boolean().optional().default(false),
    abnormalReason: z.string().max(500).nullish(),
    players: z.array(playerSchema).min(1, 'players 不能为空'),
    events: z.array(eventSchema).optional().default([]),
  })
  .passthrough();

type IngestMatchPayload = z.infer<typeof ingestMatchSchema>;

interface VerifiedRequest {
  server: ServerRow;
  body: Buffer;
  payloadHash: string;
  ip: string | null;
}

function headerValue(req: express.Request, name: string): string {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value.trim() : '';
}

export function createIngestRouter(ctx: AppContext): Router {
  const { db, config } = ctx;
  const router = Router();

  // 原始 body（用于签名与 SHA-256），必须在 express.json 之前解析
  router.use(express.raw({ type: () => true, limit: '12mb' }));
  router.use(
    rateLimit({
      name: 'ingest',
      windowMs: 60_000,
      max: 120,
      disabled: config.rateLimitDisabled,
      keyGenerator: (req) => headerValue(req, 'x-xbed-server') || req.ip || 'unknown',
    }),
  );

  const recordSubmission = (
    serverKey: string,
    externalMatchId: string | null,
    matchId: number | null,
    payloadHash: string | null,
    state: 'accepted' | 'duplicate' | 'rejected',
    error: string | null,
    ip: string | null,
  ): void => {
    db.prepare(
      `INSERT INTO server_submissions (server_key, external_match_id, match_id, payload_hash, state, error, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(serverKey, externalMatchId, matchId, payloadHash, state, error, ip);
  };

  const verifyRequest = (req: express.Request): VerifiedRequest => {
    const serverKey = headerValue(req, 'x-xbed-server');
    const timestamp = headerValue(req, 'x-xbed-timestamp');
    const nonce = headerValue(req, 'x-xbed-nonce');
    const signature = headerValue(req, 'x-xbed-signature').toLowerCase();
    const ip = req.ip ?? null;

    if (!serverKey || !timestamp || !nonce || !signature) {
      throw errors.badSignature('缺少 X-XBed-Server / Timestamp / Nonce / Signature 认证头');
    }
    if (!/^[0-9a-fA-F]{16,128}$/.test(nonce)) {
      throw errors.badSignature('Nonce 格式非法（需 16-128 位 hex）');
    }

    const server = db.prepare('SELECT * FROM servers WHERE server_key = ?').get(serverKey) as
      | ServerRow
      | undefined;
    if (!server || server.state !== 'active') {
      writeAudit(db, {
        action: 'ingest.bad_server',
        targetType: 'server',
        targetId: serverKey,
        reason: '服务器未注册或已吊销',
        ip,
      });
      throw errors.badSignature('服务器未注册或密钥已被吊销');
    }
    if (!server.secret_enc) {
      throw errors.badSignature('服务器密钥不可用');
    }

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    const payloadHash = sha256Hex(body);
    const path = req.originalUrl.split('?')[0] ?? req.path;
    const canonical = `${req.method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${payloadHash}`;

    let secret: string;
    try {
      secret = decryptString(server.secret_enc, config.encryptionKey);
    } catch {
      throw errors.badSignature('服务器密钥解密失败');
    }
    const expected = hmacSha256Hex(secret, canonical);
    if (!timingSafeEqualHex(expected, signature)) {
      writeAudit(db, {
        action: 'ingest.bad_signature',
        targetType: 'server',
        targetId: server.server_key,
        reason: 'HMAC 签名校验失败',
        after: { path, method: req.method },
        ip,
      });
      recordSubmission(server.server_key, null, null, payloadHash, 'rejected', 'bad_signature', ip);
      throw errors.badSignature();
    }

    const timestampNumber = Number(timestamp);
    if (!Number.isFinite(timestampNumber) || !/^\d{10}$/.test(timestamp)) {
      throw errors.staleTimestamp('时间戳必须为秒级 Unix 时间戳');
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampNumber) > MAX_CLOCK_SKEW_SECONDS) {
      recordSubmission(server.server_key, null, null, payloadHash, 'rejected', 'stale_timestamp', ip);
      throw errors.staleTimestamp(`时间戳超出 ±${MAX_CLOCK_SKEW_SECONDS}s 允许窗口`);
    }

    // Nonce 去重（5 分钟窗口；主键唯一约束保证原子性）
    try {
      db.prepare('INSERT INTO server_nonces (nonce, server_key) VALUES (?, ?)').run(nonce, serverKey);
    } catch (error) {
      const sqliteError = error as { code?: string };
      if (typeof sqliteError.code === 'string' && sqliteError.code.startsWith('SQLITE_CONSTRAINT')) {
        recordSubmission(server.server_key, null, null, payloadHash, 'rejected', 'nonce_reused', ip);
        throw errors.nonceReused();
      }
      throw error;
    }
    // 顺带清理过期 nonce（保留 24 小时）
    db.prepare(
      "DELETE FROM server_nonces WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')",
    ).run();

    db.prepare('UPDATE servers SET last_seen_at = ? WHERE id = ?').run(nowIso(), server.id);
    return { server, body, payloadHash, ip };
  };

  router.get('/ping', (req, res) => {
    const verified = verifyRequest(req);
    res.status(200).json({
      ok: true,
      server: verified.server.server_key,
      time: nowIso(),
    });
  });

  router.post('/match', (req, res) => {
    const verified = verifyRequest(req);

    let rawPayload: unknown;
    try {
      const text = verified.body.toString('utf8');
      rawPayload = text ? JSON.parse(text) : null;
    } catch {
      recordSubmission(
        verified.server.server_key,
        null,
        null,
        verified.payloadHash,
        'rejected',
        'invalid_json',
        verified.ip,
      );
      throw errors.invalidPayload('请求体不是合法 JSON');
    }

    const parsed = ingestMatchSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      recordSubmission(
        verified.server.server_key,
        typeof (rawPayload as { matchId?: unknown })?.matchId === 'string'
          ? String((rawPayload as { matchId: string }).matchId)
          : null,
        null,
        verified.payloadHash,
        'rejected',
        'invalid_payload',
        verified.ip,
      );
      throw errors.invalidPayload('比赛数据校验失败', details);
    }

    const payload = parsed.data;
    const duplicate = db
      .prepare('SELECT * FROM matches WHERE server_id = ? AND external_match_id = ?')
      .get(verified.server.server_key, payload.matchId) as MatchRow | undefined;
    if (duplicate) {
      recordSubmission(
        verified.server.server_key,
        payload.matchId,
        duplicate.id,
        verified.payloadHash,
        'duplicate',
        null,
        verified.ip,
      );
      res.status(200).json({
        ok: true,
        matchId: duplicate.id,
        state: duplicate.state,
        duplicate: true,
      });
      return;
    }

    const matchSeason = matchSeasonByStartAt(db, payload.startedAt);
    const matchState = !matchSeason ? 'abnormal' : payload.abnormal ? 'abnormal' : 'pending';
    const abnormalReason = !matchSeason
      ? 'no_season'
      : payload.abnormal
        ? payload.abnormalReason ?? '插件标记异常'
        : null;
    const rawText = JSON.stringify(rawPayload);

    const run = db.transaction((): number => {
      const now = nowIso();
      const matchInfo = db
        .prepare(
          `INSERT INTO matches
             (season_id, external_match_id, server_id, arena, arena_display, mode, state,
              started_at, ended_at, end_reason, winner_team, is_draw, abnormal_reason, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          matchSeason?.id ?? null,
          payload.matchId,
          verified.server.server_key,
          payload.arena ?? null,
          payload.arenaDisplay ?? null,
          payload.mode ?? null,
          matchState,
          payload.startedAt ?? null,
          payload.endedAt ?? null,
          payload.endReason ?? null,
          payload.winnerTeam ?? null,
          payload.isDraw ? 1 : 0,
          abnormalReason,
          now,
        );
      const matchId = Number(matchInfo.lastInsertRowid);

      db.prepare(
        `INSERT INTO match_raw_data (match_id, payload, payload_hash, schema_version)
         VALUES (?, ?, ?, ?)`,
      ).run(matchId, rawText, verified.payloadHash, payload.schemaVersion);

      const insertPlayer = db.prepare(
        `INSERT INTO match_players
           (match_id, user_id, uuid, game_id, team, is_winner, placement, kills, final_kills,
            deaths, final_deaths, beds_broken, raw_stats)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(match_id, game_id) DO NOTHING`,
      );
      const linkedUserIds = new Set<number>();
      const seenGameIds = new Set<string>();
      // 只关联「比赛开始前已完成报名」的玩家：
      // 补报玩家报名之前的比赛不追溯计入，避免补报后把历史对局刷进统计。
      const findUser = db.prepare(
        `SELECT u.* FROM users u
           JOIN registrations r
             ON r.user_id = u.id AND r.season_id = ? AND r.state = 'active'
          WHERE lower(u.game_id) = lower(?) AND u.status = 'active'
            AND r.created_at <= ?
          LIMIT 1`,
      );
      const linkStartedAt = payload.startedAt ?? nowIso();

      for (const player of payload.players) {
        const key = player.gameId.toLowerCase();
        if (seenGameIds.has(key)) continue;
        seenGameIds.add(key);
        const matchedUser = matchSeason
          ? (findUser.get(matchSeason.id, player.gameId, linkStartedAt) as UserRow | undefined)
          : undefined;
        if (matchedUser) linkedUserIds.add(matchedUser.id);
        const extras: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(player)) {
          if (
            ![
              'uuid',
              'gameId',
              'team',
              'isWinner',
              'kills',
              'finalKills',
              'deaths',
              'finalDeaths',
              'bedsBroken',
              'placement',
            ].includes(field)
          ) {
            extras[field] = value;
          }
        }
        insertPlayer.run(
          matchId,
          matchedUser?.id ?? null,
          player.uuid ?? null,
          player.gameId,
          player.team ?? null,
          player.isWinner ? 1 : 0,
          player.placement ?? null,
          player.kills,
          player.finalKills,
          player.deaths,
          player.finalDeaths,
          player.bedsBroken,
          Object.keys(extras).length > 0 ? JSON.stringify(extras) : null,
        );
      }

      const insertEvent = db.prepare(
        'INSERT INTO match_events (match_id, event_type, at, actor, target, team, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const event of payload.events) {
        const extras: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(event)) {
          if (!['type', 'at', 'actor', 'target', 'team'].includes(field)) extras[field] = value;
        }
        insertEvent.run(
          matchId,
          event.type,
          event.at ?? null,
          event.actor ?? null,
          event.target ?? null,
          event.team ?? null,
          Object.keys(extras).length > 0 ? JSON.stringify(extras) : null,
        );
      }

      // 关联玩家日志/回放提交状态（未绑定玄剑账号的玩家不建行）
      for (const userId of linkedUserIds) {
        db.prepare(
          "INSERT OR IGNORE INTO match_logs (match_id, user_id, state) VALUES (?, ?, 'missing')",
        ).run(matchId, userId);
        db.prepare(
          "INSERT OR IGNORE INTO match_replays (match_id, user_id, state) VALUES (?, ?, 'missing')",
        ).run(matchId, userId);
      }

      recordSubmission(
        verified.server.server_key,
        payload.matchId,
        matchId,
        verified.payloadHash,
        'accepted',
        null,
        verified.ip,
      );
      return matchId;
    });

    const matchId = run();
    res.status(200).json({
      ok: true,
      matchId,
      state: matchState,
      duplicate: false,
      seasonId: matchSeason?.id ?? null,
      linkedPlayers: (
        db.prepare('SELECT COUNT(*) AS c FROM match_players WHERE match_id = ? AND user_id IS NOT NULL').get(
          matchId,
        ) as { c: number }
      ).c,
    });
  });

  return router;
}

export type { IngestMatchPayload };
