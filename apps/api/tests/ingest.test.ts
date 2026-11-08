import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import {
  cleanupTestFiles,
  createSessionFor,
  createTestContext,
  createUser,
  ingestMatch,
  sampleMatchPayload,
  serverSecret,
  setSeasonRunning,
  signIngest,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let l1Cookie: string;

function makePlayers(winnerGameId: string, loserGameId: string) {
  return [
    {
      uuid: crypto.randomUUID(),
      gameId: winnerGameId,
      team: '红队',
      isWinner: true,
      kills: 8,
      finalKills: 2,
      deaths: 3,
      finalDeaths: 1,
      bedsBroken: 1,
      placement: 1,
    },
    {
      uuid: crypto.randomUUID(),
      gameId: loserGameId,
      team: '蓝队',
      isWinner: false,
      kills: 3,
      finalKills: 1,
      deaths: 5,
      finalDeaths: 2,
      bedsBroken: 0,
      placement: 2,
    },
  ];
}

beforeAll(() => {
  ctx = createTestContext();
  setSeasonRunning(ctx.db, ctx.seed.seasonId);
  createUser(ctx.db, { gameId: 'Steve', nickname: 'Steve' });
  createUser(ctx.db, { gameId: 'Alex', nickname: 'Alex' });
  const l1 = createUser(ctx.db, { level: 1, nickname: '审核员' });
  l1Cookie = createSessionFor(ctx.db, l1).cookie;
});
afterAll(() => cleanupTestFiles(ctx));

describe('服务器上报 HMAC', () => {
  it('GET /ingest/ping 签名通过', async () => {
    const headers = signIngest(serverSecret(ctx), { method: 'GET', path: '/api/ingest/ping' });
    const res = await request(ctx.app).get('/api/ingest/ping').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.server).toBe('s1');
    expect(res.body.time).toBeTruthy();
  });

  it('GET /ingest/ping 未签名 → 401 bad_signature', async () => {
    const res = await request(ctx.app).get('/api/ingest/ping');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('bad_signature');
  });

  it('有效上报：写入比赛/原始数据/玩家关联，返回 pending', async () => {
    const payload = sampleMatchPayload({ players: makePlayers('Steve', 'Alex') });
    const res = await ingestMatch(ctx, payload);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.state).toBe('pending');
    expect(res.body.seasonId).toBe(ctx.seed.seasonId);

    const match = ctx.db
      .prepare('SELECT * FROM matches WHERE external_match_id = ?')
      .get(payload.matchId as string) as { id: number; season_id: number; state: string };
    expect(match.season_id).toBe(ctx.seed.seasonId);

    const raw = ctx.db.prepare('SELECT * FROM match_raw_data WHERE match_id = ?').get(match.id) as {
      payload_hash: string;
      schema_version: number;
    };
    expect(raw.payload_hash).toHaveLength(64);
    expect(raw.schema_version).toBe(1);

    const players = ctx.db
      .prepare('SELECT * FROM match_players WHERE match_id = ? ORDER BY game_id')
      .all(match.id) as Array<{ game_id: string; user_id: number | null; is_winner: number }>;
    expect(players).toHaveLength(2);
    const steve = ctx.db.prepare("SELECT * FROM match_players WHERE match_id = ? AND game_id = 'Steve'").get(match.id) as {
      user_id: number | null;
      is_winner: number;
    };
    expect(steve.user_id).toBeTruthy();
    expect(steve.is_winner).toBe(1);

    const logs = ctx.db.prepare('SELECT * FROM match_logs WHERE match_id = ?').all(match.id);
    expect(logs.length).toBe(2);

    const submission = ctx.db
      .prepare('SELECT * FROM server_submissions WHERE external_match_id = ? ORDER BY id DESC')
      .get(payload.matchId as string) as { state: string };
    expect(submission.state).toBe('accepted');
  });

  it('重复上报同一 matchId → duplicate:true 且不重复写入', async () => {
    const payload = sampleMatchPayload({ players: makePlayers('Steve', 'Alex') });
    const first = await ingestMatch(ctx, payload);
    expect(first.status).toBe(200);
    const countBefore = (ctx.db.prepare('SELECT COUNT(*) AS c FROM matches').get() as { c: number }).c;
    const rawBefore = (ctx.db.prepare('SELECT COUNT(*) AS c FROM match_raw_data').get() as { c: number }).c;

    const second = await ingestMatch(ctx, payload);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.matchId).toBe(first.body.matchId);
    expect((ctx.db.prepare('SELECT COUNT(*) AS c FROM matches').get() as { c: number }).c).toBe(countBefore);
    expect((ctx.db.prepare('SELECT COUNT(*) AS c FROM match_raw_data').get() as { c: number }).c).toBe(rawBefore);
    const submission = ctx.db
      .prepare("SELECT * FROM server_submissions WHERE external_match_id = ? AND state = 'duplicate'")
      .get(payload.matchId as string);
    expect(submission).toBeTruthy();
  });

  it('签名错误 → 401 bad_signature 并记录失败上报', async () => {
    const payload = sampleMatchPayload({ players: makePlayers('Steve', 'Alex') });
    const res = await ingestMatch(ctx, payload, { secret: 'wrong-secret' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('bad_signature');
    const rejected = ctx.db
      .prepare("SELECT * FROM server_submissions WHERE state = 'rejected' AND error = 'bad_signature'")
      .all();
    expect(rejected.length).toBeGreaterThan(0);
    const audit = ctx.db
      .prepare("SELECT * FROM audit_logs WHERE action = 'ingest.bad_signature'")
      .all();
    expect(audit.length).toBeGreaterThan(0);
  });

  it('时间戳超出 ±300s → 401 stale_timestamp', async () => {
    const payload = sampleMatchPayload({ players: makePlayers('Steve', 'Alex') });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    const res = await ingestMatch(ctx, payload, { timestamp: staleTimestamp });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('stale_timestamp');
  });

  it('Nonce 重放 → 401 nonce_reused', async () => {
    const payload = sampleMatchPayload({ players: makePlayers('Steve', 'Alex') });
    const nonce = crypto.randomBytes(16).toString('hex');
    const first = await ingestMatch(ctx, payload, { nonce });
    expect(first.status).toBe(200);
    const second = await ingestMatch(ctx, payload, { nonce });
    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe('nonce_reused');
  });

  it('无效 payload（players 为空）→ 400 invalid_payload', async () => {
    const payload = sampleMatchPayload({ players: [] });
    const res = await ingestMatch(ctx, payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_payload');
  });

  it('未绑定玄剑账号的 gameId → match_players.user_id = null', async () => {
    const payload = sampleMatchPayload({ players: makePlayers('UnknownOne', 'UnknownTwo') });
    const res = await ingestMatch(ctx, payload);
    expect(res.status).toBe(200);
    const rows = ctx.db
      .prepare('SELECT user_id FROM match_players WHERE match_id = ?')
      .all(res.body.matchId) as Array<{ user_id: number | null }>;
    expect(rows.every((row) => row.user_id === null)).toBe(true);
    expect(res.body.linkedPlayers).toBe(0);
  });

  it('插件标记 abnormal → state=abnormal 且保留原因', async () => {
    const payload = sampleMatchPayload({
      players: makePlayers('Steve', 'Alex'),
      abnormal: true,
      abnormalReason: '服务器崩溃',
    });
    const res = await ingestMatch(ctx, payload);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('abnormal');
    const match = ctx.db.prepare('SELECT * FROM matches WHERE id = ?').get(res.body.matchId) as {
      state: string;
      abnormal_reason: string;
    };
    expect(match.state).toBe('abnormal');
    expect(match.abnormal_reason).toBe('服务器崩溃');
  });

  it('startedAt 匹配不到 running 赛季 → season_id=NULL 且 abnormal/no_season', async () => {
    const payload = sampleMatchPayload({
      players: makePlayers('Steve', 'Alex'),
      startedAt: new Date(Date.now() - 100 * 86_400_000).toISOString(),
      endedAt: new Date(Date.now() - 99 * 86_400_000).toISOString(),
    });
    const res = await ingestMatch(ctx, payload);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('abnormal');
    expect(res.body.seasonId).toBeNull();
    const match = ctx.db.prepare('SELECT * FROM matches WHERE id = ?').get(res.body.matchId) as {
      season_id: number | null;
      abnormal_reason: string;
    };
    expect(match.season_id).toBeNull();
    expect(match.abnormal_reason).toBe('no_season');
  });

  it('补报玩家报名之前的比赛不追溯关联（user_id 为空）', async () => {
    // 新玩家：未报名就打了这场比赛
    createUser(ctx.db, { gameId: 'LateJoiner', nickname: '补报玩家' });
    const payload = sampleMatchPayload({
      players: [
        {
          uuid: crypto.randomUUID(),
          gameId: 'LateJoiner',
          team: '红队',
          isWinner: true,
          kills: 5,
          finalKills: 1,
          deaths: 1,
          finalDeaths: 0,
          bedsBroken: 1,
          placement: 1,
        },
      ],
    });
    const ingest = await ingestMatch(ctx, payload, { skipParticipantRegistration: true });
    expect(ingest.status).toBe(200);
    expect(ingest.body.linkedPlayers).toBe(0);

    const row = ctx.db
      .prepare('SELECT user_id FROM match_players WHERE match_id = ? AND game_id = ?')
      .get(ingest.body.matchId, 'LateJoiner') as { user_id: number | null };
    expect(row.user_id).toBeNull();

    // 报名时间晚于比赛开始 → 仍不追溯关联
    const user = ctx.db.prepare("SELECT id FROM users WHERE game_id = 'LateJoiner'").get() as { id: number };
    ctx.db
      .prepare(
        `INSERT OR IGNORE INTO registrations (season_id, user_id, game_id, custom_data, state, created_at)
         VALUES (?, ?, 'LateJoiner', '{}', 'active', ?)`,
      )
      .run(ctx.seed.seasonId, user.id, new Date().toISOString());
    const row2 = ctx.db
      .prepare('SELECT user_id FROM match_players WHERE match_id = ? AND game_id = ?')
      .get(ingest.body.matchId, 'LateJoiner') as { user_id: number | null };
    expect(row2.user_id).toBeNull();
  });

  it('被吊销的服务器密钥 → 401', async () => {
    ctx.db.prepare("UPDATE servers SET state = 'revoked' WHERE server_key = 's1'").run();
    const payload = sampleMatchPayload({ players: makePlayers('Steve', 'Alex') });
    const res = await ingestMatch(ctx, payload);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('bad_signature');
    ctx.db.prepare("UPDATE servers SET state = 'active' WHERE server_key = 's1'").run();
  });

  it('L1 可审核 pending 比赛（联动检查状态机）', async () => {
    const payload = sampleMatchPayload({ players: makePlayers('Steve', 'Alex') });
    const ingest = await ingestMatch(ctx, payload);
    const review = await request(ctx.app)
      .post(`/api/admin/matches/${ingest.body.matchId}/review`)
      .set('Cookie', l1Cookie)
      .send({ action: 'approve' });
    expect(review.status).toBe(200);
    expect(review.body.state).toBe('approved');
  });
});
