import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupTestFiles,
  createSessionFor,
  createTestContext,
  createUser,
  type TestContext,
} from './helpers.js';
import { addMinutes } from '../src/lib/time.js';

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestContext();
});
afterEach(() => {
  cleanupTestFiles(ctx);
  ctx.db.close();
});

function newUserSession() {
  const user = createUser(ctx.db, { nickname: '邮件测试', gameId: 'MailUser' });
  return { user, cookie: createSessionFor(ctx.db, user).cookie };
}

describe('邮箱验证码', () => {
  it('发送验证码：记录 email_verifications，非生产环境返回 devCode，未配置 SMTP 不报错', async () => {
    const { user, cookie } = newUserSession();
    const res = await request(ctx.app)
      .post('/api/me/email/send')
      .set('Cookie', cookie)
      .send({ email: 'player@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.sent).toBe(false); // SMTP 未配置
    expect(res.body.devCode).toMatch(/^\d{6}$/);

    const row = ctx.db
      .prepare('SELECT * FROM email_verifications WHERE user_id = ? ORDER BY id DESC')
      .get(user.id) as { email: string; code_hash: string; expires_at: string };
    expect(row.email).toBe('player@example.com');
    expect(row.code_hash).toHaveLength(64);
    expect(row.code_hash).not.toContain(res.body.devCode);
    // 10 分钟有效期
    const ttl = Date.parse(row.expires_at) - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000 + 5_000);

    const mailLog = ctx.db
      .prepare('SELECT * FROM email_logs WHERE user_id = ? ORDER BY id DESC')
      .get(user.id) as { state: string };
    expect(mailLog.state).toBe('failed'); // 未配置 SMTP 记录失败但不抛错
  });

  it('60 秒内重复发送 → 429 rate_limited', async () => {
    const { cookie } = newUserSession();
    await request(ctx.app)
      .post('/api/me/email/send')
      .set('Cookie', cookie)
      .send({ email: 'player@example.com' });
    const again = await request(ctx.app)
      .post('/api/me/email/send')
      .set('Cookie', cookie)
      .send({ email: 'player@example.com' });
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe('rate_limited');
  });

  it('验证码错误 → 400 且累计 attempts；正确 → 绑定成功', async () => {
    const { user, cookie } = newUserSession();
    const send = await request(ctx.app)
      .post('/api/me/email/send')
      .set('Cookie', cookie)
      .send({ email: 'bind@example.com' });
    const code = send.body.devCode as string;

    const wrong = await request(ctx.app)
      .post('/api/me/email/verify')
      .set('Cookie', cookie)
      .send({ code: code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    const row = ctx.db
      .prepare('SELECT * FROM email_verifications WHERE user_id = ? ORDER BY id DESC')
      .get(user.id) as { attempts: number };
    expect(row.attempts).toBe(1);

    const ok = await request(ctx.app)
      .post('/api/me/email/verify')
      .set('Cookie', cookie)
      .send({ code });
    expect(ok.status).toBe(200);
    expect(ok.body.emailVerified).toBe(true);

    const userRow = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as {
      email: string;
      email_verified: number;
      email_verified_at: string;
    };
    expect(userRow.email).toBe('bind@example.com');
    expect(userRow.email_verified).toBe(1);
    expect(userRow.email_verified_at).toBeTruthy();
  });

  it('验证码过期 → 400', async () => {
    const { user, cookie } = newUserSession();
    ctx.db
      .prepare(
        `INSERT INTO email_verifications (user_id, email, code_hash, expires_at)
         VALUES (?, 'expired@example.com', 'deadbeef', ?)`,
      )
      .run(user.id, addMinutes(new Date(), -5));
    const res = await request(ctx.app)
      .post('/api/me/email/verify')
      .set('Cookie', cookie)
      .send({ code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('过期');
  });

  it('1 小时最多 8 次 → 第 9 次 429', async () => {
    const { user, cookie } = newUserSession();
    // 预置 8 条过去 1 小时内的发送记录（最近一条 2 分钟前，绕过 60s 冷却）
    const insert = ctx.db.prepare(
      `INSERT INTO email_verifications (user_id, email, code_hash, created_at, expires_at)
       VALUES (?, 'limit@example.com', 'hash', ?, ?)`,
    );
    for (let index = 0; index < 8; index += 1) {
      const minutesAgo = 2 + index;
      insert.run(user.id, addMinutes(new Date(), -minutesAgo), addMinutes(new Date(), 8));
    }
    const res = await request(ctx.app)
      .post('/api/me/email/send')
      .set('Cookie', cookie)
      .send({ email: 'limit@example.com' });
    expect(res.status).toBe(429);
    expect(res.body.error.message).toContain('上限');
  });

  it('非法邮箱格式 → 400', async () => {
    const { cookie } = newUserSession();
    const res = await request(ctx.app)
      .post('/api/me/email/send')
      .set('Cookie', cookie)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });
});
