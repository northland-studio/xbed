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
});
