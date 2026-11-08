import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cleanupTestFiles, createTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestContext();
});
afterEach(() => {
  cleanupTestFiles(ctx);
  ctx.db.close();
});

describe('皮肤代理', () => {
  it('非法 gameId → 404（不请求上游）', async () => {
    const res = await request(ctx.app).get('/api/skin/bad%21name');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('skin_not_found');
  });

  it('过短 gameId → 404', async () => {
    const res = await request(ctx.app).get('/api/skin/a');
    expect(res.status).toBe(404);
  });
});
