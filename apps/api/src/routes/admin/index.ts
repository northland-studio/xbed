import { Router } from 'express';
import type { AppContext } from '../../app.js';
import { storageStatsFromRows } from '../../lib/storage.js';
import { requireAdmin } from '../../middleware/auth.js';
import { createSeasonsAdminRouter } from './seasons.js';
import { createMatchesAdminRouter } from './matches.js';
import { createContentAdminRouter } from './content.js';
import { createSystemAdminRouter } from './system.js';

export function createAdminRouter(ctx: AppContext): Router {
  const { db, config } = ctx;
  const router = Router();

  // 所有 /admin 接口至少需要 level>=1；标 ★ 的接口在子路由内额外 requireSuper
  router.use(requireAdmin);

  router.get('/overview', (_req, res) => {
    const count = (sql: string, ...params: unknown[]): number =>
      (db.prepare(sql).get(...params) as { c: number }).c;

    const storageRows = db
      .prepare('SELECT kind, size_bytes FROM match_evidence')
      .all() as Array<{ kind: string; size_bytes: number }>;
    const storage = storageStatsFromRows(storageRows);

    const counts = {
      users: count('SELECT COUNT(*) AS c FROM users'),
      activeUsers: count("SELECT COUNT(*) AS c FROM users WHERE status = 'active'"),
      seasons: count('SELECT COUNT(*) AS c FROM seasons'),
      matches: count('SELECT COUNT(*) AS c FROM matches'),
      registrations: count("SELECT COUNT(*) AS c FROM registrations WHERE state = 'active'"),
      pendingMatches: count("SELECT COUNT(*) AS c FROM matches WHERE state IN ('pending','in_review')"),
      abnormalMatches: count("SELECT COUNT(*) AS c FROM matches WHERE state = 'abnormal'"),
      pendingAppeals: count("SELECT COUNT(*) AS c FROM match_appeals WHERE state IN ('open','processing')"),
      unreadNotifications: count('SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0'),
      emailFailed: count("SELECT COUNT(*) AS c FROM email_logs WHERE state = 'failed'"),
      failedSubmissions: count(
        "SELECT COUNT(*) AS c FROM server_submissions WHERE state = 'rejected' AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')",
      ),
      teams: count("SELECT COUNT(*) AS c FROM teams WHERE state = 'active'"),
      evidence: storageRows.length,
    };

    const todos: string[] = [];
    if (counts.pendingMatches > 0) todos.push(`有 ${counts.pendingMatches} 场比赛待审核`);
    if (counts.abnormalMatches > 0) todos.push(`有 ${counts.abnormalMatches} 场异常比赛待裁定`);
    if (counts.pendingAppeals > 0) todos.push(`有 ${counts.pendingAppeals} 条申诉待处理`);
    if (counts.failedSubmissions > 0) todos.push(`近 24 小时有 ${counts.failedSubmissions} 次服务器上报失败`);
    if (counts.emailFailed > 0) todos.push(`有 ${counts.emailFailed} 封邮件发送失败`);

    const dbMode = db.pragma('journal_mode', { simple: true });
    res.status(200).json({
      counts,
      storage,
      todos,
      db: {
        file: config.dbFile,
        journalMode: String(dbMode),
        sizeBytes: null,
      },
      uptime: Math.floor(process.uptime()),
    });
  });

  router.use(createSeasonsAdminRouter(ctx));
  router.use(createMatchesAdminRouter(ctx));
  router.use(createContentAdminRouter(ctx));
  router.use(createSystemAdminRouter(ctx));

  return router;
}
