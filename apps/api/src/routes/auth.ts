import { Router } from 'express';
import type { AppContext } from '../app.js';
import { nowIso } from '../lib/time.js';
import { addMinutes } from '../lib/time.js';
import { errors } from '../lib/errors.js';
import { randomHex } from '../lib/crypto.js';
import { asyncRoute } from '../middleware/error.js';
import { permissionSummary, requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { publicUser } from '../lib/serialize.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  readSessionId,
  setSessionCookie,
} from '../lib/session.js';
import type { UserRow } from '../db/models.js';
import { resolveOAuthUser, saveOAuthAccount, type XuanjianUser } from '../lib/oauth.js';

function sanitizeRedirect(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value.slice(0, 500);
}

function parseLevel(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createAuthRouter(ctx: AppContext): Router {
  const { db, config, oauthClient } = ctx;
  const router = Router();

  router.get(
    '/login',
    rateLimit({ name: 'auth-login', windowMs: 60_000, max: 60, disabled: config.rateLimitDisabled }),
    (req, res) => {
      if (!oauthClient) throw errors.notConfigured('玄剑 OAuth 未配置（缺少 client_id/client_secret）');
      const redirect = sanitizeRedirect(req.query.redirect);
      const state = randomHex(24);
      db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(nowIso());
      db.prepare('INSERT INTO oauth_states (state, redirect, ip, expires_at) VALUES (?, ?, ?, ?)').run(
        state,
        redirect,
        req.ip ?? null,
        addMinutes(nowIso(), 5),
      );
      res.redirect(302, oauthClient.authorizeUrl(state));
    },
  );

  router.get(
    '/callback',
    rateLimit({ name: 'auth-callback', windowMs: 60_000, max: 60, disabled: config.rateLimitDisabled }),
    asyncRoute(async (req, res) => {
      if (!oauthClient) throw errors.notConfigured('玄剑 OAuth 未配置');
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!code || !state) throw errors.invalidRequest('缺少 code 或 state 参数');

      const stateRow = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state) as
        | { state: string; redirect: string | null; expires_at: string }
        | undefined;
      if (!stateRow) throw errors.invalidRequest('state 无效或已被使用，请重新登录');
      // state 一次性：取出后立即删除，重放必然失败
      db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
      if (stateRow.expires_at < nowIso()) throw errors.invalidRequest('state 已过期，请重新登录');

      let tokens;
      try {
        tokens = await oauthClient.exchangeCode(code);
      } catch (error) {
        throw errors.oauthFailed(error instanceof Error ? error.message : '授权码交换失败');
      }

      const resolved = await resolveOAuthUser(oauthClient, tokens);
      if (!resolved.valid || !resolved.user.id) {
        throw errors.unauthorized('玄剑 Token 校验失败');
      }
      const xuanjianUser = resolved.user as Partial<XuanjianUser>;
      if (xuanjianUser.is_member !== true) {
        throw errors.forbidden('仅限玄剑公会成员登录 XBed');
      }
      if (xuanjianUser.level === -1) {
        throw errors.forbidden('托管系统账号（level=-1）不允许进入 XBed 用户体系');
      }
      const level = typeof xuanjianUser.level === 'number' ? xuanjianUser.level : 0;
      if (!Number.isFinite(level) || level < -1) {
        throw errors.forbidden('玄剑等级数据异常');
      }

      const existing = db
        .prepare('SELECT * FROM users WHERE xuanjian_user_id = ?')
        .get(xuanjianUser.id) as UserRow | undefined;
      if (existing?.status === 'disabled') {
        throw errors.forbidden('账号已被禁用，请联系管理员');
      }

      const nickname = xuanjianUser.nickname ?? xuanjianUser.username ?? xuanjianUser.id;
      const username = xuanjianUser.username ?? nickname;
      const now = nowIso();
      let userId: number;
      if (existing) {
        db.prepare(
          `UPDATE users SET username = ?, nickname = ?, avatar = ?, level = ?, title = ?,
             contribution = ?, is_member = 1, game_id = COALESCE(?, game_id), updated_at = ?
           WHERE id = ?`,
        ).run(
          username,
          nickname,
          xuanjianUser.avatar ?? null,
          level,
          xuanjianUser.title ?? null,
          xuanjianUser.contribution ?? 0,
          xuanjianUser.game_id ?? null,
          now,
          existing.id,
        );
        userId = existing.id;
      } else {
        const info = db
          .prepare(
            `INSERT INTO users
               (xuanjian_user_id, username, nickname, avatar, level, title, contribution, is_member, game_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          )
          .run(
            xuanjianUser.id,
            username,
            nickname,
            xuanjianUser.avatar ?? null,
            level,
            xuanjianUser.title ?? null,
            xuanjianUser.contribution ?? 0,
            xuanjianUser.game_id ?? null,
          );
        userId = Number(info.lastInsertRowid);
      }

      saveOAuthAccount(db, userId, tokens, config, { lastLoginAt: now });
      const session = createSession(db, {
        userId,
        level,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        ttlDays: config.sessionTtlDays,
      });
      setSessionCookie(res, config, session.id, session.expiresAt);

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
      if (req.query.format === 'json') {
        res.status(200).json({
          ok: true,
          user: publicUser(user, { includePrivate: true }),
          level,
          permissions: { canAdmin: level >= 1, canSuper: level >= 2 },
        });
        return;
      }
      res.redirect(302, sanitizeRedirect(stateRow.redirect));
    }),
  );

  router.post('/logout', (req, res) => {
    const sessionId = readSessionId(req.cookies);
    if (sessionId) destroySession(db, sessionId);
    clearSessionCookie(res, config);
    res.status(200).json({ ok: true });
  });

  router.get('/me', (req, res) => {
    if (!req.auth) {
      res.status(200).json({
        user: null,
        level: 0,
        permissions: { canAdmin: false, canSuper: false },
      });
      return;
    }
    res.status(200).json({
      user: publicUser(req.auth.user, { includePrivate: true }),
      level: req.auth.level,
      permissions: permissionSummary(req),
    });
  });

  // 仅开发环境：配合 OAUTH_MOCK=1 时用于本地联调（生产环境不注册有效逻辑）
  router.get('/mock-login', (req, res) => {
    if (!config.oauthMock) throw errors.notFound('接口不存在');
    const level = Math.max(0, Math.min(2, parseLevel(req.query.level)));
    const xuanjianId =
      (typeof req.query.userId === 'string' && req.query.userId) || `mock-user-${level}`;
    const nickname =
      (typeof req.query.nickname === 'string' && req.query.nickname) || `测试用户L${level}`;
    const gameId = (typeof req.query.gameId === 'string' && req.query.gameId) || undefined;
    const now = nowIso();
    const existing = db
      .prepare('SELECT * FROM users WHERE xuanjian_user_id = ?')
      .get(xuanjianId) as UserRow | undefined;
    let userId: number;
    if (existing) {
      db.prepare(
        'UPDATE users SET nickname = ?, level = ?, is_member = 1, game_id = COALESCE(?, game_id), updated_at = ? WHERE id = ?',
      ).run(nickname, level, gameId ?? null, now, existing.id);
      userId = existing.id;
    } else {
      const info = db
        .prepare(
          `INSERT INTO users (xuanjian_user_id, username, nickname, level, is_member, game_id)
           VALUES (?, ?, ?, ?, 1, ?)`,
        )
        .run(xuanjianId, nickname, nickname, level, gameId ?? null);
      userId = Number(info.lastInsertRowid);
    }
    const session = createSession(db, {
      userId,
      level,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      ttlDays: config.sessionTtlDays,
    });
    setSessionCookie(res, config, session.id, session.expiresAt);
    if (req.query.format === 'json') {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
      res.status(200).json({ ok: true, sessionId: session.id, user: publicUser(user, { includePrivate: true }), level });
      return;
    }
    res.redirect(302, sanitizeRedirect(req.query.redirect));
  });

  return router;
}
