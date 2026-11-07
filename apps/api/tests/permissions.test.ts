import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupTestFiles,
  createTestContext,
  createSessionFor,
  createUser,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let l0Cookie: string;
let l1Cookie: string;
let l2Cookie: string;
let l0User: ReturnType<typeof createUser>;

beforeAll(() => {
  ctx = createTestContext();
  l0User = createUser(ctx.db, { nickname: 'L0成员', level: 0 });
  const l1User = createUser(ctx.db, { nickname: 'L1管理员', level: 1 });
  const l2User = createUser(ctx.db, { nickname: 'L2超管', level: 2 });
  l0Cookie = createSessionFor(ctx.db, l0User).cookie;
  l1Cookie = createSessionFor(ctx.db, l1User).cookie;
  l2Cookie = createSessionFor(ctx.db, l2User).cookie;
});
afterAll(() => cleanupTestFiles(ctx));

describe('权限矩阵（后端强制校验）', () => {
  it('未登录访问管理接口 → 401', async () => {
    const res = await request(ctx.app).get('/api/admin/overview');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('L0 访问管理接口 → 403', async () => {
    const overview = await request(ctx.app).get('/api/admin/overview').set('Cookie', l0Cookie);
    expect(overview.status).toBe(403);
    expect(overview.body.error.code).toBe('forbidden');
    const users = await request(ctx.app).get('/api/admin/users').set('Cookie', l0Cookie);
    expect(users.status).toBe(403);
  });

  it('L1 可以访问普通管理接口，但不能访问 ★ 超管接口', async () => {
    const overview = await request(ctx.app).get('/api/admin/overview').set('Cookie', l1Cookie);
    expect(overview.status).toBe(200);
    expect(overview.body.counts).toBeTruthy();

    const users = await request(ctx.app).get('/api/admin/users').set('Cookie', l1Cookie);
    expect(users.status).toBe(200);
    expect(Array.isArray(users.body.items)).toBe(true);

    // ★ 赛季创建
    const createSeason = await request(ctx.app)
      .post('/api/admin/seasons')
      .set('Cookie', l1Cookie)
      .send({ code: 'S99', name: 'L1 不该能创建' });
    expect(createSeason.status).toBe(403);

    // ★ 服务器密钥
    const servers = await request(ctx.app).get('/api/admin/servers').set('Cookie', l1Cookie);
    expect(servers.status).toBe(403);

    // ★ 系统设置
    const settings = await request(ctx.app).get('/api/admin/settings').set('Cookie', l1Cookie);
    expect(settings.status).toBe(403);

    // ★ 积分调整
    const adjust = await request(ctx.app)
      .post('/api/admin/points/adjust')
      .set('Cookie', l1Cookie)
      .send({ seasonId: ctx.seed.seasonId, userId: l0User.id, delta: 5, reason: 'test' });
    expect(adjust.status).toBe(403);
  });

  it('L2 可以访问 ★ 超管接口', async () => {
    const servers = await request(ctx.app).get('/api/admin/servers').set('Cookie', l2Cookie);
    expect(servers.status).toBe(200);
    expect(servers.body.items[0].serverKey).toBe('s1');
    expect(servers.body.items[0].secret).toBeUndefined();

    const settings = await request(ctx.app).get('/api/admin/settings').set('Cookie', l2Cookie);
    expect(settings.status).toBe(200);
    expect(settings.body.settings.site_name).toBeTruthy();

    const createSeason = await request(ctx.app)
      .post('/api/admin/seasons')
      .set('Cookie', l2Cookie)
      .send({ code: 'S99', name: '测试赛季' });
    expect(createSeason.status).toBe(200);
    expect(createSeason.body.code).toBe('S99');

    const rankTiers = await request(ctx.app).get('/api/admin/rank-tiers').set('Cookie', l2Cookie);
    expect(rankTiers.status).toBe(200);
    expect(rankTiers.body.items.length).toBeGreaterThan(0);
  });

  it('写操作 Origin 不同源 → 403', async () => {
    const res = await request(ctx.app)
      .post('/api/admin/notifications/broadcast')
      .set('Cookie', l2Cookie)
      .set('Origin', 'https://evil.example.com')
      .send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('写操作 Origin 同源 → 通过', async () => {
    const res = await request(ctx.app)
      .post('/api/admin/notifications/broadcast')
      .set('Cookie', l2Cookie)
      .set('Origin', 'http://127.0.0.1:3939')
      .send({ title: '同源广播测试' });
    expect(res.status).toBe(200);
    expect(res.body.recipients).toBeGreaterThan(0);
  });

  it('L0 可以访问玩家端接口', async () => {
    const me = await request(ctx.app).get('/api/auth/me').set('Cookie', l0Cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(l0User.id);
    const profile = await request(ctx.app).get('/api/me/profile').set('Cookie', l0Cookie);
    expect(profile.status).toBe(200);
    expect(profile.body.user.id).toBe(l0User.id);
  });

  it('系统设置（★）：脱敏返回、*** 不修改、白名单外键拒绝', async () => {
    const before = await request(ctx.app).get('/api/admin/settings').set('Cookie', l2Cookie);
    expect(before.status).toBe(200);
    expect(before.body.items.some((item: { key: string }) => item.key === 'site_name')).toBe(true);

    const update = await request(ctx.app)
      .put('/api/admin/settings')
      .set('Cookie', l2Cookie)
      .send({ items: [{ key: 'site_name', value: 'XBed 测试站' }, { key: 'smtp_pass', value: '***' }] });
    expect(update.status).toBe(200);
    expect(update.body.updated).toBe(1);

    const after = await request(ctx.app).get('/api/admin/settings').set('Cookie', l2Cookie);
    expect(after.body.settings.site_name).toBe('XBed 测试站');

    const forbiddenKey = await request(ctx.app)
      .put('/api/admin/settings')
      .set('Cookie', l2Cookie)
      .send({ settings: { session_secret: 'hack' } });
    expect(forbiddenKey.status).toBe(400);
  });

  it('段位配置（★）：upsert 与 DELETE 单条', async () => {
    const created = await request(ctx.app)
      .patch('/api/admin/rank-tiers')
      .set('Cookie', l2Cookie)
      .send({ kind: 'season', seasonId: ctx.seed.seasonId, name: '测试段位', minPoints: 999, color: '#ffffff' });
    expect(created.status).toBe(200);
    expect(created.body.name).toBe('测试段位');

    const updated = await request(ctx.app)
      .patch('/api/admin/rank-tiers')
      .set('Cookie', l2Cookie)
      .send({ id: created.body.id, kind: 'season', name: '测试段位改', minPoints: 999 });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('测试段位改');

    const deleted = await request(ctx.app)
      .delete(`/api/admin/rank-tiers/${created.body.id}`)
      .set('Cookie', l2Cookie);
    expect(deleted.status).toBe(200);
    const list = await request(ctx.app).get('/api/admin/rank-tiers').set('Cookie', l2Cookie);
    expect(list.body.items.some((item: { id: number }) => item.id === created.body.id)).toBe(false);
  });

  it('文件列表返回存储统计（logsBytes/logsFiles/replaysBytes/replaysFiles）', async () => {
    const res = await request(ctx.app).get('/api/admin/files').set('Cookie', l2Cookie);
    expect(res.status).toBe(200);
    expect(res.body.storage).toMatchObject({
      totalBytes: 0,
      totalFiles: 0,
      logsBytes: 0,
      logsFiles: 0,
      replaysBytes: 0,
      replaysFiles: 0,
    });
  });

  it('审计日志仅 L2 可访问', async () => {
    const l1 = await request(ctx.app).get('/api/admin/audit').set('Cookie', l1Cookie);
    expect(l1.status).toBe(403);
    const l2 = await request(ctx.app).get('/api/admin/audit').set('Cookie', l2Cookie);
    expect(l2.status).toBe(200);
  });
});
