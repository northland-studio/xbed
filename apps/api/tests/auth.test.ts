import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupTestFiles,
  createTestContext,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;

beforeAll(() => {
  ctx = createTestContext();
});
afterAll(() => cleanupTestFiles(ctx));

async function loginFlow(redirect = '/'): Promise<{
  callback: request.Response;
  state: string;
  cookie?: string;
}> {
  const login = await request(ctx.app).get(`/api/auth/login?redirect=${encodeURIComponent(redirect)}`);
  expect(login.status).toBe(302);
  const location = login.headers.location as string;
  const state = new URL(location, 'http://localhost').searchParams.get('state') ?? '';
  const callback = await request(ctx.app).get(
    `/api/auth/callback?code=mock-code&state=${encodeURIComponent(state)}`,
  );
  const setCookie = callback.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const sessionCookie = cookies.find((item) => item.startsWith('xbed_sess='));
  return { callback, state, cookie: sessionCookie };
}

describe('OAuth 登录流程', () => {
  it('GET /auth/login 生成一次性 state 并 302 到玄剑授权页', async () => {
    const res = await request(ctx.app).get('/api/auth/login?redirect=/me/profile');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('mock-oauth.local');
    const state = new URL(res.headers.location as string).searchParams.get('state') ?? '';
    expect(state.length).toBeGreaterThan(20);
    const row = ctx.db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state) as
      | { expires_at: string }
      | undefined;
    expect(row).toBeTruthy();
    // 5 分钟有效期
    const ttl = Date.parse(row!.expires_at) - Date.now();
    expect(ttl).toBeGreaterThan(4 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000 + 5_000);
  });

  it('state 不存在 → 400 invalid_request', async () => {
    const res = await request(ctx.app).get('/api/auth/callback?code=mock-code&state=not-exists');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it('缺少 code/state → 400', async () => {
    const res = await request(ctx.app).get('/api/auth/callback');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it('非玄剑公会成员 → 403 且不建立会话', async () => {
    ctx.oauth.setUser({
      id: 'non-member',
      username: 'nonmember',
      nickname: '非成员',
      level: 0,
      is_member: false,
      game_id: null,
    });
    const { callback } = await loginFlow();
    expect(callback.status).toBe(403);
    expect(callback.body.error.code).toBe('forbidden');
    const sessions = ctx.db
      .prepare('SELECT COUNT(*) AS c FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.xuanjian_user_id = ?')
      .get('non-member') as { c: number };
    expect(sessions.c).toBe(0);
  });

  it('level=-1 托管账号 → 403', async () => {
    ctx.oauth.setUser({
      id: 'system-account',
      username: 'system',
      nickname: '托管账号',
      level: -1,
      is_member: true,
      game_id: null,
    });
    const { callback } = await loginFlow();
    expect(callback.status).toBe(403);
    expect(callback.body.error.code).toBe('forbidden');
  });

  it('成功登录：创建/同步用户、建会话、state 一次性', async () => {
    ctx.oauth.setUser({
      id: 'xuanjian-1',
      username: 'steve_xj',
      nickname: 'Steve',
      level: 1,
      is_member: true,
      game_id: 'Steve',
      title: '成员',
      contribution: 100,
      avatar: 'https://example.com/a.png',
    });
    const { callback, state, cookie } = await loginFlow('/me/profile');
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/me/profile');
    expect(cookie).toBeTruthy();
    expect(cookie!).toContain('HttpOnly');

    const user = ctx.db
      .prepare('SELECT * FROM users WHERE xuanjian_user_id = ?')
      .get('xuanjian-1') as {
      id: number;
      nickname: string;
      level: number;
      is_member: number;
      game_id: string;
      contribution: number;
    };
    expect(user.nickname).toBe('Steve');
    expect(user.level).toBe(1);
    expect(user.is_member).toBe(1);
    expect(user.game_id).toBe('Steve');
    expect(user.contribution).toBe(100);

    const oauthAccount = ctx.db
      .prepare('SELECT * FROM oauth_accounts WHERE user_id = ?')
      .get(user.id) as { access_token_enc: string; refresh_token_enc: string };
    expect(oauthAccount.access_token_enc.startsWith('v1:')).toBe(true);
    expect(oauthAccount.access_token_enc).not.toContain('mock-access-token');
    expect(oauthAccount.refresh_token_enc.startsWith('v1:')).toBe(true);

    const me = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie!);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
    expect(me.body.level).toBe(1);
    expect(me.body.permissions).toEqual({ canAdmin: true, canSuper: false });

    // state 重放失败
    const replay = await request(ctx.app).get(
      `/api/auth/callback?code=mock-code&state=${encodeURIComponent(state)}`,
    );
    expect(replay.status).toBe(400);
  });

  it('未登录 /auth/me → user:null', async () => {
    const res = await request(ctx.app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(res.body.permissions.canAdmin).toBe(false);
  });

  it('会话等级为登录时快照，重新登录后才更新', async () => {
    ctx.oauth.setUser({
      id: 'xuanjian-level',
      username: 'leveluser',
      nickname: '等级测试',
      level: 0,
      is_member: true,
      game_id: 'LevelUser',
    });
    const first = await loginFlow();
    expect(first.callback.status).toBe(302);
    const cookie = first.cookie!;
    // 用户等级在玄剑侧被提升，但当前会话不刷新
    ctx.db.prepare('UPDATE users SET level = 2 WHERE xuanjian_user_id = ?').run('xuanjian-level');
    const me = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.body.level).toBe(0);
    // 重新登录后生效
    ctx.oauth.setUser({
      id: 'xuanjian-level',
      username: 'leveluser',
      nickname: '等级测试',
      level: 2,
      is_member: true,
      game_id: 'LevelUser',
    });
    const second = await loginFlow();
    const me2 = await request(ctx.app).get('/api/auth/me').set('Cookie', second.cookie!);
    expect(me2.body.level).toBe(2);
    expect(me2.body.permissions.canSuper).toBe(true);
  });

  it('禁用账号不能登录', async () => {
    ctx.oauth.setUser({
      id: 'xuanjian-disabled',
      username: 'disabled',
      nickname: '禁用用户',
      level: 0,
      is_member: true,
      game_id: null,
    });
    const first = await loginFlow();
    expect(first.callback.status).toBe(302);
    ctx.db.prepare("UPDATE users SET status = 'disabled' WHERE xuanjian_user_id = ?").run('xuanjian-disabled');
    const second = await loginFlow();
    expect(second.callback.status).toBe(403);
  });

  it('POST /auth/logout 销毁会话', async () => {
    ctx.oauth.setUser({
      id: 'xuanjian-logout',
      username: 'logoutuser',
      nickname: '退出测试',
      level: 0,
      is_member: true,
      game_id: null,
    });
    const { cookie } = await loginFlow();
    const logout = await request(ctx.app).post('/api/auth/logout').set('Cookie', cookie!);
    expect(logout.status).toBe(200);
    const me = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie!);
    expect(me.body.user).toBeNull();
  });
});
