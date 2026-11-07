import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import type {
  LifetimeStatisticsRow,
  PlayerStatisticsRow,
  RegistrationRow,
  UserRow,
} from '../db/models.js';
import { errors } from '../lib/errors.js';
import { hashVerificationCode, randomCode, verifyVerificationCode } from '../lib/crypto.js';
import { verificationCodeEmail, sendMail } from '../lib/mailer.js';
import { listNotifications, unreadNotificationCount } from '../lib/notifications.js';
import { listResponse, parsePagination } from '../lib/pagination.js';
import { notificationPublic, publicUser, registrationPublic, tierBrief } from '../lib/serialize.js';
import { getCurrentSeason } from '../lib/season.js';
import { getLifetimeTier, getSeasonTier } from '../lib/tiers.js';
import { addHours, addMinutes, nowIso } from '../lib/time.js';
import { asyncRoute } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const EMAIL_COOLDOWN_MS = 60_000;
const EMAIL_HOURLY_MAX = 8;
const EMAIL_CODE_TTL_MINUTES = 10;
const EMAIL_MAX_ATTEMPTS = 5;

const emailSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确').max(254),
});

const verifyCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, '验证码为 6 位数字'),
});

const profilePatchSchema = z.object({
  gameId: z
    .string()
    .trim()
    .min(2, '游戏 ID 至少 2 个字符')
    .max(32, '游戏 ID 最多 32 个字符')
    .regex(/^[A-Za-z0-9_]{2,32}$/, '游戏 ID 仅允许字母、数字、下划线'),
});

export function createMeRouter(ctx: AppContext): Router {
  const { db, config } = ctx;
  const router = Router();
  router.use(requireAuth);

  router.get('/profile', (req, res) => {
    const user = req.auth!.user;
    const current = getCurrentSeason(db);
    const currentStats = current
      ? (db
          .prepare('SELECT * FROM player_statistics WHERE user_id = ? AND season_id = ?')
          .get(user.id, current.id) as PlayerStatisticsRow | undefined)
      : undefined;
    const lifetimeRow =
      (db.prepare('SELECT * FROM lifetime_statistics WHERE user_id = ?').get(user.id) as
        | LifetimeStatisticsRow
        | undefined) ?? {
        user_id: user.id,
        total_points: 0,
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        kills: 0,
        deaths: 0,
        updated_at: nowIso(),
      };

    const registrations = db
      .prepare(
        `SELECT r.*, s.name AS season_name, s.code AS season_code, s.state AS season_state
         FROM registrations r JOIN seasons s ON s.id = r.season_id
         WHERE r.user_id = ? ORDER BY COALESCE(s.start_at, s.created_at) DESC, r.id DESC`,
      )
      .all(user.id) as Array<RegistrationRow & { season_name: string; season_code: string; season_state: string }>;

    const allStats = db
      .prepare(
        `SELECT ps.*, s.name AS season_name FROM player_statistics ps
         JOIN seasons s ON s.id = ps.season_id WHERE ps.user_id = ?
         ORDER BY COALESCE(s.start_at, s.created_at) DESC`,
      )
      .all(user.id) as Array<PlayerStatisticsRow & { season_name: string }>;

    const records = {
      maxKills: allStats.reduce((best, row) => Math.max(best, row.max_kills), 0),
      bestStreak: allStats.reduce((best, row) => Math.max(best, row.best_streak), 0),
      bestWinRate: allStats.reduce((best, row) => Math.max(best, row.win_rate), 0),
      totalMatches: lifetimeRow.matches,
      totalWins: lifetimeRow.wins,
      totalKills: lifetimeRow.kills,
    };

    const rankHistory = db
      .prepare('SELECT * FROM rank_history WHERE user_id = ? ORDER BY id DESC LIMIT 50')
      .all(user.id) as Array<{
      id: number;
      season_id: number | null;
      kind: string;
      from_tier: string | null;
      to_tier: string;
      points: number;
      created_at: string;
    }>;

    // 赛季趋势：按积分流水累计
    const trend: Array<{ date: string; points: number; delta: number; matchId: number | null }> = [];
    if (current) {
      const transactions = db
        .prepare(
          'SELECT id, match_id, delta, created_at FROM point_transactions WHERE season_id = ? AND user_id = ? ORDER BY id ASC',
        )
        .all(current.id, user.id) as Array<{
        id: number;
        match_id: number | null;
        delta: number;
        created_at: string;
      }>;
      let points = current.initial_points;
      for (const transaction of transactions) {
        points = Math.max(current.min_points, points + transaction.delta);
        trend.push({
          date: transaction.created_at,
          points,
          delta: transaction.delta,
          matchId: transaction.match_id,
        });
      }
      if (trend.length > 30) trend.splice(0, trend.length - 30);
    }

    const currentTier = current ? getSeasonTier(db, current.id, currentStats?.points ?? current.initial_points) : null;
    const lifetimeTier = getLifetimeTier(db, lifetimeRow.total_points);

    res.status(200).json({
      user: publicUser(user, { includePrivate: true }),
      email: user.email,
      emailVerified: user.email_verified === 1,
      gameId: user.game_id,
      seasonTier: tierBrief(currentTier),
      lifetimeTier: tierBrief(lifetimeTier),
      lifetimePoints: lifetimeRow.total_points,
      registrations: registrations.map((row) =>
        registrationPublic(row, { seasonName: row.season_name }),
      ),
      stats: currentStats
        ? {
            seasonId: current!.id,
            seasonName: current!.name,
            points: currentStats.points,
            matches: currentStats.matches,
            wins: currentStats.wins,
            losses: currentStats.losses,
            draws: currentStats.draws,
            winRate: currentStats.win_rate,
            kills: currentStats.kills,
            deaths: currentStats.deaths,
            bedsBroken: currentStats.beds_broken,
            currentStreak: currentStats.current_streak,
            bestStreak: currentStats.best_streak,
            maxKills: currentStats.max_kills,
            tier: tierBrief(currentTier),
            seasonTier: tierBrief(currentTier),
            lifetimeTier: tierBrief(lifetimeTier),
            lifetimePoints: lifetimeRow.total_points,
          }
        : null,
      currentSeason: current ? { id: current.id, name: current.name, code: current.code, state: current.state } : null,
      lifetime: {
        totalPoints: lifetimeRow.total_points,
        matches: lifetimeRow.matches,
        wins: lifetimeRow.wins,
        losses: lifetimeRow.losses,
        draws: lifetimeRow.draws,
        kills: lifetimeRow.kills,
        deaths: lifetimeRow.deaths,
        tier: tierBrief(lifetimeTier),
        lifetimeTier: tierBrief(lifetimeTier),
      },
      records,
      rankHistory: rankHistory.map((row) => ({
        id: row.id,
        seasonId: row.season_id,
        kind: row.kind,
        fromTier: row.from_tier,
        toTier: row.to_tier,
        points: row.points,
        createdAt: row.created_at,
      })),
      trend,
    });
  });

  router.patch('/profile', (req, res) => {
    const body = profilePatchSchema.parse(req.body);
    const user = req.auth!.user;
    const activeRegistration = db
      .prepare(
        `SELECT COUNT(*) AS c FROM registrations r JOIN seasons s ON s.id = r.season_id
         WHERE r.user_id = ? AND r.state = 'active' AND s.state NOT IN ('sealed','archived')`,
      )
      .get(user.id) as { c: number };
    if (activeRegistration.c > 0) {
      throw errors.forbidden('已报名赛季进行期间不允许修改游戏 ID');
    }
    db.prepare("UPDATE users SET game_id = ?, updated_at = ? WHERE id = ?").run(
      body.gameId,
      nowIso(),
      user.id,
    );
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow;
    res.status(200).json({ ok: true, user: publicUser(updated, { includePrivate: true }) });
  });

  router.post(
    '/email/send',
    rateLimit({ name: 'email-send', windowMs: 10 * 60_000, max: 20, disabled: config.rateLimitDisabled }),
    asyncRoute(async (req, res) => {
      const body = emailSchema.parse(req.body);
      const user = req.auth!.user;
      const now = Date.now();

      const last = db
        .prepare('SELECT created_at FROM email_verifications WHERE user_id = ? ORDER BY id DESC LIMIT 1')
        .get(user.id) as { created_at: string } | undefined;
      if (last) {
        const elapsed = now - Date.parse(last.created_at);
        if (elapsed < EMAIL_COOLDOWN_MS) {
          const wait = Math.ceil((EMAIL_COOLDOWN_MS - elapsed) / 1000);
          throw errors.rateLimited(`发送过于频繁，请 ${wait} 秒后再试`);
        }
      }
      const hourCount = db
        .prepare('SELECT COUNT(*) AS c FROM email_verifications WHERE user_id = ? AND created_at > ?')
        .get(user.id, addHours(nowIso(), -1)) as { c: number };
      if (hourCount.c >= EMAIL_HOURLY_MAX) {
        throw errors.rateLimited('1 小时内验证码发送次数已达上限（8 次）');
      }

      const code = randomCode(6);
      const expiresAt = addMinutes(nowIso(), EMAIL_CODE_TTL_MINUTES);
      db.prepare(
        `INSERT INTO email_verifications (user_id, email, code_hash, purpose, ip, expires_at)
         VALUES (?, ?, ?, 'verify_email', ?, ?)`,
      ).run(user.id, body.email, hashVerificationCode(code, config.sessionSecret), req.ip ?? null, expiresAt);

      const template = verificationCodeEmail(code, '绑定邮箱');
      const result = await sendMail(db, config, {
        to: body.email,
        subject: template.subject,
        text: template.text,
        html: template.html,
        template: 'verify_email',
        userId: user.id,
      });
      if (!result.sent) {
        console.log(`[email] SMTP 未配置或发送失败，验证码打印到日志（不抛错）: user=${user.id} email=${body.email} code=${code}`);
      }
      res.status(200).json({
        ok: true,
        sent: result.sent,
        expiresIn: EMAIL_CODE_TTL_MINUTES * 60,
        cooldown: EMAIL_COOLDOWN_MS / 1000,
        // 仅开发/测试且邮件未配置时返回，方便本地联调；生产环境不会返回
        ...(!config.isProduction && !result.sent ? { devCode: code } : {}),
      });
    }),
  );

  router.post('/email/verify', (req, res) => {
    const body = verifyCodeSchema.parse(req.body);
    const user = req.auth!.user;
    const row = db
      .prepare(
        'SELECT * FROM email_verifications WHERE user_id = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1',
      )
      .get(user.id) as
      | {
          id: number;
          email: string;
          code_hash: string;
          attempts: number;
          expires_at: string;
        }
      | undefined;
    if (!row) throw errors.invalidRequest('没有待验证的邮箱，请先发送验证码');
    if (row.expires_at < nowIso()) throw errors.invalidRequest('验证码已过期，请重新发送');
    if (row.attempts >= EMAIL_MAX_ATTEMPTS) throw errors.rateLimited('验证码尝试次数过多，请重新发送');

    db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    if (!verifyVerificationCode(body.code, row.code_hash, config.sessionSecret)) {
      throw errors.invalidRequest(`验证码错误（还可尝试 ${EMAIL_MAX_ATTEMPTS - row.attempts - 1} 次）`);
    }

    const now = nowIso();
    db.prepare('UPDATE email_verifications SET consumed_at = ? WHERE id = ?').run(now, row.id);
    db.prepare(
      'UPDATE users SET email = ?, email_verified = 1, email_verified_at = ?, updated_at = ? WHERE id = ?',
    ).run(row.email, now, now, user.id);

    res.status(200).json({ ok: true, email: row.email, emailVerified: true });
  });

  router.get('/notifications', (req, res) => {
    const user = req.auth!.user;
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const unreadOnly = String(req.query.unread ?? '') === '1' || String(req.query.unread ?? '') === 'true';
    const result = listNotifications(db, user.id, {
      limit: pagination.limit,
      offset: pagination.offset,
      unreadOnly,
    });
    res.status(200).json({
      ...listResponse(
        result.items.map((row) => notificationPublic(row)),
        result.total,
        pagination,
      ),
      unread: unreadNotificationCount(db, user.id),
    });
  });

  router.post('/notifications/read', (req, res) => {
    const user = req.auth!.user;
    const schema = z
      .object({
        ids: z.array(z.number().int().positive()).optional(),
        all: z.boolean().optional(),
      })
      .refine((value) => value.all === true || (value.ids && value.ids.length > 0), {
        message: '需要 ids 或 all:true',
      });
    const body = schema.parse(req.body);
    let updated = 0;
    if (body.all) {
      updated = db
        .prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
        .run(user.id).changes;
    } else if (body.ids && body.ids.length > 0) {
      const placeholders = body.ids.map(() => '?').join(',');
      updated = db
        .prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${placeholders})`)
        .run(user.id, ...body.ids).changes;
    }
    res.status(200).json({ ok: true, updated, unread: unreadNotificationCount(db, user.id) });
  });

  return router;
}
