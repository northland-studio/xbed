import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupTestFiles,
  createSessionFor,
  createTestContext,
  createUser,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestContext();
});
afterEach(() => {
  cleanupTestFiles(ctx);
  ctx.db.close();
});

describe('赛季报名', () => {
  it('邮箱未验证 → 403 email_unverified', async () => {
    const user = createUser(ctx.db, { nickname: '未验证', gameId: 'Unverified' });
    const { cookie } = createSessionFor(ctx.db, user);
    const res = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'Unverified' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('email_unverified');
  });

  it('未登录 → 401', async () => {
    const res = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .send({ gameId: 'Nobody' });
    expect(res.status).toBe(401);
  });

  it('验证邮箱后报名成功，初始化赛季积分 60，重复报名 409', async () => {
    const user = createUser(ctx.db, {
      nickname: '报名者',
      gameId: 'RegisterOne',
      email: 'register@example.com',
      emailVerified: true,
    });
    const { cookie } = createSessionFor(ctx.db, user);

    const res = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'RegisterOne' });
    expect(res.status).toBe(200);
    expect(res.body.registration.state).toBe('active');
    expect(res.body.registration.gameId).toBe('RegisterOne');

    const stats = ctx.db
      .prepare('SELECT * FROM player_statistics WHERE user_id = ? AND season_id = ?')
      .get(user.id, ctx.seed.seasonId) as { points: number };
    expect(stats.points).toBe(60);

    const notification = ctx.db
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'registration_success'")
      .all(user.id);
    expect(notification.length).toBe(1);

    const again = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'RegisterOne' });
    expect(again.status).toBe(409);

    const mine = await request(ctx.app).get('/api/me/registrations').set('Cookie', cookie);
    expect(mine.status).toBe(200);
    expect(mine.body.total).toBe(1);
    expect(mine.body.items[0].seasonName).toContain('S1');
  });

  it('自定义报名字段：必填缺失 400，选项非法 400，合法写入 custom_data', async () => {
    ctx.db
      .prepare(
        `INSERT INTO registration_fields (season_id, key, label, type, required, options, sort_order)
         VALUES (?, 'qq', 'QQ 号', 'text', 1, NULL, 1)`,
      )
      .run(ctx.seed.seasonId);
    ctx.db
      .prepare(
        `INSERT INTO registration_fields (season_id, key, label, type, required, options, sort_order)
         VALUES (?, 'role', '擅长位置', 'select', 0, ?, 2)`,
      )
      .run(ctx.seed.seasonId, JSON.stringify(['进攻', '防守']));

    const user = createUser(ctx.db, {
      nickname: '自定义字段',
      gameId: 'CustomFields',
      email: 'custom@example.com',
      emailVerified: true,
    });
    const { cookie } = createSessionFor(ctx.db, user);

    const missing = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'CustomFields' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toContain('QQ');

    const invalidOption = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'CustomFields', custom: { qq: '123456', role: '打野' } });
    expect(invalidOption.status).toBe(400);

    const ok = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'CustomFields', custom: { qq: '123456', role: '进攻' } });
    expect(ok.status).toBe(200);
    expect(ok.body.registration.customData).toEqual({ qq: '123456', role: '进攻' });
  });

  it('报名关闭（draft/已结束）→ 403 registration_closed', async () => {
    ctx.db.prepare("UPDATE seasons SET state = 'draft' WHERE id = ?").run(ctx.seed.seasonId);
    const user = createUser(ctx.db, {
      nickname: '关闭测试',
      gameId: 'ClosedSeason',
      email: 'closed@example.com',
      emailVerified: true,
    });
    const { cookie } = createSessionFor(ctx.db, user);
    const res = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'ClosedSeason' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('registration_closed');
  });

  it('报名期间可退出；开赛后禁止退出', async () => {
    const user = createUser(ctx.db, {
      nickname: '退出测试',
      gameId: 'WithdrawUser',
      email: 'withdraw@example.com',
      emailVerified: true,
    });
    const { cookie } = createSessionFor(ctx.db, user);
    const register = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'WithdrawUser' });
    expect(register.status).toBe(200);
    const registrationId = register.body.registration.id;

    const withdraw = await request(ctx.app)
      .post(`/api/me/registrations/${registrationId}/withdraw`)
      .set('Cookie', cookie);
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.state).toBe('revoked');

    // 重新报名后开赛，退出被拒绝
    const reRegister = await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'WithdrawUser' });
    expect(reRegister.status).toBe(200);
    ctx.db.prepare("UPDATE seasons SET state = 'running' WHERE id = ?").run(ctx.seed.seasonId);
    const blocked = await request(ctx.app)
      .post(`/api/me/registrations/${registrationId}/withdraw`)
      .set('Cookie', cookie);
    expect(blocked.status).toBe(409);
  });

  it('已报名赛季期间禁止修改 game_id；无报名时可改', async () => {
    const free = createUser(ctx.db, { nickname: '自由', gameId: 'FreeUser' });
    const freeSession = createSessionFor(ctx.db, free);
    const patchFree = await request(ctx.app)
      .patch('/api/me/profile')
      .set('Cookie', freeSession.cookie)
      .send({ gameId: 'FreeUserNew' });
    expect(patchFree.status).toBe(200);
    expect(patchFree.body.user.gameId).toBe('FreeUserNew');

    const user = createUser(ctx.db, {
      nickname: '已报名',
      gameId: 'RegisteredUser',
      email: 'patch@example.com',
      emailVerified: true,
    });
    const { cookie } = createSessionFor(ctx.db, user);
    await request(ctx.app)
      .post(`/api/seasons/${ctx.seed.seasonId}/register`)
      .set('Cookie', cookie)
      .send({ gameId: 'RegisteredUser' });
    const blocked = await request(ctx.app)
      .patch('/api/me/profile')
      .set('Cookie', cookie)
      .send({ gameId: 'ChangedID' });
    expect(blocked.status).toBe(403);
  });
});
