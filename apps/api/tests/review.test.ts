import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupTestFiles,
  createSessionFor,
  createTestContext,
  createUser,
  ingestMatch,
  registerPlayer,
  sampleMatchPayload,
  setSeasonRunning,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let l1Cookie: string;
let steve: ReturnType<typeof registerPlayer>;
let alex: ReturnType<typeof registerPlayer>;

function players(steveGameId: string, alexGameId: string) {
  return [
    {
      uuid: crypto.randomUUID(),
      gameId: steveGameId,
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
      gameId: alexGameId,
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

async function ingestReadyMatch(overrides: Record<string, unknown> = {}) {
  const payload = sampleMatchPayload({
    players: players('Steve', 'Alex'),
    ...overrides,
  });
  const res = await ingestMatch(ctx, payload);
  expect(res.status).toBe(200);
  return res.body.matchId as number;
}

async function approve(matchId: number) {
  return request(ctx.app)
    .post(`/api/admin/matches/${matchId}/review`)
    .set('Cookie', l1Cookie)
    .send({ action: 'approve' });
}

function steveStats() {
  return ctx.db
    .prepare('SELECT * FROM player_statistics WHERE user_id = ? AND season_id = ?')
    .get(steve.user.id, ctx.seed.seasonId) as {
    points: number;
    matches: number;
    wins: number;
    draws: number;
    kills: number;
    current_streak: number;
    best_streak: number;
    max_kills: number;
  };
}

beforeEach(() => {
  ctx = createTestContext();
  setSeasonRunning(ctx.db, ctx.seed.seasonId);
  const l1 = createUser(ctx.db, { level: 1, nickname: '审核员' });
  l1Cookie = createSessionFor(ctx.db, l1).cookie;
  steve = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'Steve', gameId: 'Steve' });
  alex = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'Alex', gameId: 'Alex' });
});

afterEach(() => {
  cleanupTestFiles(ctx);
  ctx.db.close();
});

describe('赛果审核与积分结算', () => {
  it('approve：赛果/积分/统计/段位/通知/审计在同一事务内完成，重复审核不重复结算', async () => {
    const matchId = await ingestReadyMatch();
    const res = await approve(matchId);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('approved');
    expect(res.body.version).toBe(1);

    const match = ctx.db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as {
      state: string;
      reviewed_by: number;
      reviewed_at: string;
    };
    expect(match.state).toBe('approved');
    expect(match.reviewed_by).toBeTruthy();
    expect(match.reviewed_at).toBeTruthy();

    const result = ctx.db.prepare('SELECT * FROM match_results WHERE match_id = ?').get(matchId) as {
      version: number;
      players_json: string;
    };
    expect(result.version).toBe(1);
    expect(JSON.parse(result.players_json)).toHaveLength(2);

    const versions = ctx.db
      .prepare('SELECT * FROM match_result_versions WHERE match_id = ?')
      .all(matchId) as Array<{ version: number; before_json: string | null }>;
    expect(versions).toHaveLength(1);
    expect(versions[0]!.before_json).toBeNull();

    const transactions = ctx.db
      .prepare('SELECT * FROM point_transactions WHERE match_id = ? ORDER BY user_id')
      .all(matchId) as Array<{ user_id: number; delta: number; reason: string; balance_after: number }>;
    expect(transactions).toHaveLength(2);
    const steveTx = transactions.find((tx) => tx.user_id === steve.user.id)!;
    const alexTx = transactions.find((tx) => tx.user_id === alex.user.id)!;
    expect(steveTx.delta).toBe(5);
    expect(steveTx.reason).toBe('match_win');
    expect(steveTx.balance_after).toBe(65);
    expect(alexTx.delta).toBe(-5);
    expect(alexTx.reason).toBe('match_loss');
    expect(alexTx.balance_after).toBe(55);

    const stats = steveStats();
    expect(stats.points).toBe(65);
    expect(stats.matches).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.kills).toBe(8);
    expect(stats.current_streak).toBe(1);
    expect(stats.best_streak).toBe(1);
    expect(stats.max_kills).toBe(8);

    const lifetime = ctx.db
      .prepare('SELECT * FROM lifetime_statistics WHERE user_id = ?')
      .get(steve.user.id) as { total_points: number; wins: number };
    expect(lifetime.total_points).toBe(5);
    expect(lifetime.wins).toBe(1);

    const rankHistory = ctx.db
      .prepare("SELECT * FROM rank_history WHERE user_id = ? AND kind = 'season' ORDER BY id")
      .all(steve.user.id) as Array<{ from_tier: string | null; to_tier: string; points: number }>;
    expect(rankHistory.length).toBeGreaterThan(0);
    const lastTier = rankHistory[rankHistory.length - 1]!;
    expect(lastTier.to_tier).toBe('黄金');
    expect(lastTier.points).toBe(65);

    const notification = ctx.db
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'match_result'")
      .all(steve.user.id);
    expect(notification.length).toBeGreaterThan(0);

    const audit = ctx.db
      .prepare("SELECT * FROM audit_logs WHERE action = 'match.approve' AND target_id = ?")
      .get(String(matchId)) as { actor_user_id: number; after_data: string } | undefined;
    expect(audit).toBeTruthy();
    expect(JSON.parse(audit!.after_data).resultVersion).toBe(1);

    // 重复审核不重复结算
    const again = await approve(matchId);
    expect(again.status).toBe(409);
    const txCount = (
      ctx.db.prepare('SELECT COUNT(*) AS c FROM point_transactions WHERE match_id = ?').get(matchId) as {
        c: number;
      }
    ).c;
    expect(txCount).toBe(2);
    expect(steveStats().points).toBe(65);
  });

  it('平局：积分为 0，draws+1', async () => {
    const matchId = await ingestReadyMatch({ isDraw: true, winnerTeam: null });
    const res = await approve(matchId);
    expect(res.status).toBe(200);
    const stats = steveStats();
    expect(stats.points).toBe(60);
    expect(stats.draws).toBe(1);
    expect(stats.wins).toBe(0);
    const drawTx = ctx.db
      .prepare('SELECT * FROM point_transactions WHERE match_id = ? AND user_id = ?')
      .get(matchId, steve.user.id) as { delta: number; reason: string };
    expect(drawTx.delta).toBe(0);
    expect(drawTx.reason).toBe('match_draw');
  });

  it('驳回必须填写理由；驳回后状态 rejected 且不结算', async () => {
    const matchId = await ingestReadyMatch();
    const noReason = await request(ctx.app)
      .post(`/api/admin/matches/${matchId}/review`)
      .set('Cookie', l1Cookie)
      .send({ action: 'reject' });
    expect(noReason.status).toBe(400);

    const rejected = await request(ctx.app)
      .post(`/api/admin/matches/${matchId}/review`)
      .set('Cookie', l1Cookie)
      .send({ action: 'reject', reason: '证据缺失' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.state).toBe('rejected');
    const results = ctx.db
      .prepare('SELECT COUNT(*) AS c FROM match_results WHERE match_id = ?')
      .get(matchId) as { c: number };
    expect(results.c).toBe(0);
    expect(steveStats().points).toBe(60);
  });

  it('correct：写入版本历史、前后数据与理由，统计按新赛果重算', async () => {
    const matchId = await ingestReadyMatch();
    await approve(matchId);
    expect(steveStats().points).toBe(65);

    const before = ctx.db
      .prepare('SELECT * FROM match_results WHERE match_id = ?')
      .get(matchId) as { version: number; players_json: string };

    const correct = await request(ctx.app)
      .post(`/api/admin/matches/${matchId}/review`)
      .set('Cookie', l1Cookie)
      .send({
        action: 'correct',
        reason: '日志核对后修正击杀数',
        corrected: [{ gameId: 'Steve', kills: 12, finalKills: 5 }],
      });
    expect(correct.status).toBe(200);
    expect(correct.body.version).toBe(2);

    const after = ctx.db.prepare('SELECT * FROM match_results WHERE match_id = ?').get(matchId) as {
      version: number;
      players_json: string;
    };
    expect(after.version).toBe(2);
    const correctedPlayers = JSON.parse(after.players_json) as Array<{
      gameId: string;
      kills: number;
      finalKills: number;
      deaths: number;
    }>;
    const steveResult = correctedPlayers.find((player) => player.gameId === 'Steve')!;
    expect(steveResult.kills).toBe(12);
    expect(steveResult.finalKills).toBe(5);
    expect(steveResult.deaths).toBe(3); // 未提供的字段保持原值

    const versions = ctx.db
      .prepare('SELECT * FROM match_result_versions WHERE match_id = ? ORDER BY version')
      .all(matchId) as Array<{ version: number; before_json: string | null; after_json: string; reason: string }>;
    expect(versions).toHaveLength(2);
    expect(versions[1]!.before_json).toBe(before.players_json);
    expect(versions[1]!.reason).toContain('修正击杀数');

    const stats = steveStats();
    expect(stats.points).toBe(65); // 胜负未变，积分不变
    expect(stats.kills).toBe(12);
    expect(stats.max_kills).toBe(12);

    const approveAgain = await approve(matchId);
    expect(approveAgain.status).toBe(409);
  });

  it('correct 可以修改胜负并调整积分', async () => {
    const matchId = await ingestReadyMatch();
    await approve(matchId);
    expect(steveStats().points).toBe(65);

    const correct = await request(ctx.app)
      .post(`/api/admin/matches/${matchId}/review`)
      .set('Cookie', l1Cookie)
      .send({
        action: 'correct',
        reason: '核对录像后改判蓝队胜',
        corrected: {
          correctedWinnerTeam: '蓝队',
          players: [
            { gameId: 'Steve', isWinner: false },
            { gameId: 'Alex', isWinner: true },
          ],
        },
      });
    expect(correct.status).toBe(200);
    expect(steveStats().points).toBe(55);
    const alexStats = ctx.db
      .prepare('SELECT points FROM player_statistics WHERE user_id = ? AND season_id = ?')
      .get(alex.user.id, ctx.seed.seasonId) as { points: number };
    expect(alexStats.points).toBe(65);
  });

  it('void：作废后积分冲正、比赛记录保留', async () => {
    const matchId = await ingestReadyMatch();
    await approve(matchId);
    expect(steveStats().points).toBe(65);

    const res = await request(ctx.app)
      .post(`/api/admin/matches/${matchId}/review`)
      .set('Cookie', l1Cookie)
      .send({ action: 'void', reason: '确认比赛数据异常，作废' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('void');

    const stats = steveStats();
    expect(stats.points).toBe(60);
    expect(stats.matches).toBe(0);
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM match_raw_data WHERE match_id = ?').get(matchId) as {
        c: number;
      }).c,
    ).toBe(1);
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM match_reviews WHERE match_id = ?').get(matchId) as {
        c: number;
      }).c,
    ).toBeGreaterThanOrEqual(2);
    expect(
      (ctx.db.prepare('SELECT COUNT(*) AS c FROM match_result_versions WHERE match_id = ?').get(matchId) as {
        c: number;
      }).c,
    ).toBe(2);
  });

  it('correct 只能用于已通过赛果', async () => {
    const matchId = await ingestReadyMatch();
    const res = await request(ctx.app)
      .post(`/api/admin/matches/${matchId}/review`)
      .set('Cookie', l1Cookie)
      .send({ action: 'correct', reason: 'x', corrected: [] });
    expect(res.status).toBe(409);
  });

  it('赛季封存后禁止常规修改（approve → 409）', async () => {
    const matchId = await ingestReadyMatch();
    ctx.db
      .prepare("UPDATE seasons SET state = 'sealed', sealed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), ctx.seed.seasonId);
    const res = await approve(matchId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('未归属赛季的比赛不能结算', async () => {
    const info = ctx.db
      .prepare(
        `INSERT INTO matches (external_match_id, server_id, state, started_at, ended_at, winner_team, submitted_at)
         VALUES (?, 's1', 'pending', ?, ?, '红队', ?)`,
      )
      .run(
        crypto.randomUUID(),
        new Date(Date.now() - 10 * 60_000).toISOString(),
        new Date().toISOString(),
        new Date().toISOString(),
      );
    const matchId = Number(info.lastInsertRowid);
    ctx.db
      .prepare(
        `INSERT INTO match_players (match_id, user_id, game_id, team, is_winner, kills, deaths)
         VALUES (?, ?, 'Steve', '红队', 1, 1, 0)`,
      )
      .run(matchId, steve.user.id);
    const res = await approve(matchId);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('赛季');

    // 管理员指定赛季后可正常审核
    const assign = await request(ctx.app)
      .post(`/api/admin/matches/${matchId}/season`)
      .set('Cookie', l1Cookie)
      .send({ seasonId: ctx.seed.seasonId });
    expect(assign.status).toBe(200);
    const approved = await approve(matchId);
    expect(approved.status).toBe(200);
  });
});
