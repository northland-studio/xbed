import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupTestFiles,
  createSessionFor,
  createTestContext,
  createUser,
  ingestMatch,
  sampleMatchPayload,
  setSeasonRunning,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let adminCookie: string;

beforeEach(() => {
  ctx = createTestContext();
  setSeasonRunning(ctx.db, ctx.seed.seasonId);
  const admin = createUser(ctx.db, { level: 2, nickname: '超管' });
  adminCookie = createSessionFor(ctx.db, admin).cookie;
});

afterEach(() => {
  cleanupTestFiles(ctx);
  ctx.db.close();
});

describe('比赛详情（含事件时间线）', () => {
  it('管理员比赛详情返回 200 且包含事件（回归：no such column: created_at）', async () => {
    const payload = sampleMatchPayload({
      events: [
        {
          type: 'kill',
          at: new Date(Date.now() - 10 * 60_000).toISOString(),
          actor: 'Steve',
          target: 'Alex',
          team: '红队',
        },
        {
          type: 'bed_break',
          at: new Date(Date.now() - 8 * 60_000).toISOString(),
          actor: 'Steve',
          team: '红队',
        },
      ],
    });
    const ingest = await ingestMatch(ctx, payload);
    expect(ingest.status).toBe(200);
    const matchId = ingest.body.matchId as number;

    const detail = await request(ctx.app).get(`/api/admin/matches/${matchId}`).set('Cookie', adminCookie);
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.events)).toBe(true);
    expect(detail.body.events.length).toBe(2);

    const events = await request(ctx.app).get(`/api/admin/matches/${matchId}/events`).set('Cookie', adminCookie);
    expect(events.status).toBe(200);
    expect(events.body.items.length).toBe(2);
  });

  it('无事件的比赛详情也不报错', async () => {
    const payload = sampleMatchPayload({ events: [] });
    const ingest = await ingestMatch(ctx, payload);
    expect(ingest.status).toBe(200);
    const matchId = ingest.body.matchId as number;

    const detail = await request(ctx.app).get(`/api/admin/matches/${matchId}`).set('Cookie', adminCookie);
    expect(detail.status).toBe(200);
    expect(detail.body.events).toEqual([]);
  });

  it('未公布比赛：游客 404 / 参赛玩家 200 / 管理员 200', async () => {
    const player = createUser(ctx.db, { gameId: 'EvidenceGuy', nickname: '证据玩家' });
    const playerCookie = createSessionFor(ctx.db, player).cookie;
    const payload = sampleMatchPayload({
      players: [
        {
          uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          gameId: 'EvidenceGuy',
          team: '红队',
          isWinner: true,
          kills: 4,
          finalKills: 1,
          deaths: 1,
          finalDeaths: 0,
          bedsBroken: 1,
          placement: 1,
        },
      ],
      events: [],
    });
    const ingest = await ingestMatch(ctx, payload);
    expect(ingest.status).toBe(200);
    const matchId = ingest.body.matchId as number;
    // 确保比赛仍是未公布状态
    ctx.db.prepare("UPDATE matches SET state = 'pending' WHERE id = ?").run(matchId);

    const guest = await request(ctx.app).get(`/api/matches/${matchId}`);
    expect(guest.status).toBe(404);

    const participant = await request(ctx.app).get(`/api/matches/${matchId}`).set('Cookie', playerCookie);
    expect(participant.status).toBe(200);
    expect(participant.body.published).toBe(false);
    expect(participant.body.viewerIsParticipant).toBe(true);
    expect(participant.body.state).toBe('pending');

    const admin = await request(ctx.app).get(`/api/matches/${matchId}`).set('Cookie', adminCookie);
    expect(admin.status).toBe(200);
  });
});
