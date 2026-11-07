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

interface PlayerHandle {
  user: { id: number; nickname: string };
  cookie: string;
}

function makePlayers(winner: string, loser: string) {
  return [
    {
      uuid: crypto.randomUUID(),
      gameId: winner,
      team: '红队',
      isWinner: true,
      kills: 10,
      finalKills: 2,
      deaths: 2,
      finalDeaths: 0,
      bedsBroken: 1,
      placement: 1,
    },
    {
      uuid: crypto.randomUUID(),
      gameId: loser,
      team: '蓝队',
      isWinner: false,
      kills: 2,
      finalKills: 0,
      deaths: 6,
      finalDeaths: 2,
      bedsBroken: 0,
      placement: 2,
    },
  ];
}

async function playMatch(winner: string, loser: string): Promise<number> {
  const res = await ingestMatch(
    ctx,
    sampleMatchPayload({ matchId: crypto.randomUUID(), players: makePlayers(winner, loser) }),
  );
  expect(res.status).toBe(200);
  const review = await request(ctx.app)
    .post(`/api/admin/matches/${res.body.matchId}/review`)
    .set('Cookie', l1Cookie)
    .send({ action: 'approve' });
  expect(review.status).toBe(200);
  return res.body.matchId as number;
}

beforeEach(() => {
  ctx = createTestContext();
  setSeasonRunning(ctx.db, ctx.seed.seasonId);
  const l1 = createUser(ctx.db, { level: 1, nickname: '审核员' });
  l1Cookie = createSessionFor(ctx.db, l1).cookie;
});

afterEach(() => {
  cleanupTestFiles(ctx);
  ctx.db.close();
});

describe('排行榜与段位', () => {
  it('按 积分↓ 胜率↓ 击杀↓ 排序，三项相同并列', async () => {
    const a = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'A', gameId: 'PlayerA' });
    const b = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'B', gameId: 'PlayerB' });
    const c = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'C', gameId: 'PlayerC' });

    await playMatch('PlayerA', 'PlayerB');
    await playMatch('PlayerA', 'PlayerC');
    await playMatch('PlayerB', 'PlayerC');

    const board = await request(ctx.app).get(`/api/seasons/${ctx.seed.seasonId}/leaderboard`);
    expect(board.status).toBe(200);
    expect(board.body.total).toBe(3);
    expect(board.body.items.map((item: { nickname: string }) => item.nickname)).toEqual(['A', 'B', 'C']);
    expect(board.body.items.map((item: { rank: number }) => item.rank)).toEqual([1, 2, 3]);

    const [first, second, third] = board.body.items as Array<{
      points: number;
      wins: number;
      losses: number;
      winRate: number;
      kills: number;
      tier: { name: string };
    }>;
    expect(first!.points).toBe(70);
    expect(first!.winRate).toBe(1);
    expect(first!.tier.name).toBe('黄金');
    expect(second!.points).toBe(60);
    expect(second!.wins).toBe(1);
    expect(second!.losses).toBe(1);
    expect(third!.points).toBe(50);
    expect(third!.tier.name).toBe('白银');

    // 后台排行榜顺序一致
    const adminBoard = await request(ctx.app)
      .get(`/api/admin/leaderboard?seasonId=${ctx.seed.seasonId}`)
      .set('Cookie', l1Cookie);
    expect(adminBoard.status).toBe(200);
    expect(adminBoard.body.items.map((item: { nickname: string }) => item.nickname)).toEqual(['A', 'B', 'C']);

    // 玩家档案里的段位与排名
    const profile = await request(ctx.app).get(`/api/players/${a.user.id}`);
    expect(profile.status).toBe(200);
    expect(profile.body.currentSeason.rank).toBe(1);
    expect(profile.body.currentSeason.tier.name).toBe('黄金');
    expect(profile.body.seasons[0].tier.name).toBe('黄金');

    // 段位历史
    const history = ctx.db
      .prepare("SELECT * FROM rank_history WHERE user_id = ? AND kind = 'season'")
      .all(a.user.id);
    expect(history.length).toBeGreaterThan(0);

    expect(a.user.id).toBeGreaterThan(0);
    expect(b.user.id).toBeGreaterThan(0);
    expect(c.user.id).toBeGreaterThan(0);
  });

  it('积分/胜率/击杀全部相同 → 并列名次', async () => {
    const d = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'D', gameId: 'PlayerD' });
    const e = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'E', gameId: 'PlayerE' });
    for (const handle of [d, e]) {
      ctx.db
        .prepare(
          `UPDATE player_statistics SET points = 45, matches = 2, wins = 1, losses = 1,
             win_rate = 0.5, kills = 10, deaths = 5 WHERE user_id = ? AND season_id = ?`,
        )
        .run(handle.user.id, ctx.seed.seasonId);
    }
    const board = await request(ctx.app).get(`/api/seasons/${ctx.seed.seasonId}/leaderboard`);
    expect(board.status).toBe(200);
    const ranks = (board.body.items as Array<{ nickname: string; rank: number }>).map((item) => ({
      nickname: item.nickname,
      rank: item.rank,
    }));
    expect(ranks).toEqual([
      { nickname: 'D', rank: 1 },
      { nickname: 'E', rank: 1 },
    ]);
  });

  it('未参赛（0 场）玩家不计入公开排行榜；后台可作为 0 场玩家展示', async () => {
    registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'ZeroMatches', gameId: 'ZeroOne' });
    const board = await request(ctx.app).get(`/api/seasons/${ctx.seed.seasonId}/leaderboard`);
    expect(board.body.total).toBe(0);

    const adminBoard = await request(ctx.app)
      .get(`/api/admin/leaderboard?seasonId=${ctx.seed.seasonId}`)
      .set('Cookie', l1Cookie);
    expect(adminBoard.status).toBe(200);
    expect(adminBoard.body.total).toBe(1);
    expect(adminBoard.body.items[0].nickname).toBe('ZeroMatches');
  });

  it('玩家历史比赛与最近战绩可查询', async () => {
    const a = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'A2', gameId: 'PlayerA2' });
    registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'B2', gameId: 'PlayerB2' });
    await playMatch('PlayerA2', 'PlayerB2');

    const matches = await request(ctx.app).get(`/api/players/${a.user.id}/matches`);
    expect(matches.status).toBe(200);
    expect(matches.body.total).toBe(1);
    expect(matches.body.items[0].player.isWinner).toBe(true);

    const profile = await request(ctx.app).get(`/api/players/${a.user.id}`);
    expect(profile.body.recentMatches).toHaveLength(1);
    expect(profile.body.records.maxKills).toBe(10);
    expect(profile.body.lifetime.totalPoints).toBe(5);
  });
});

function _unused(_value: PlayerHandle): void {
  // 保留类型导出便于后续扩展
}
