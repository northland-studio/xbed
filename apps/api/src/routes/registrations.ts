import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import type { RegistrationFieldRow, RegistrationRow } from '../db/models.js';
import { errors } from '../lib/errors.js';
import { createNotification } from '../lib/notifications.js';
import { listResponse, parseId, parsePagination } from '../lib/pagination.js';
import { parseJson, registrationPublic } from '../lib/serialize.js';
import { getSeason, seasonIsRegistrationOpen, seasonStateLabel } from '../lib/season.js';
import { getSettingBool } from '../lib/settings.js';
import { nowIso } from '../lib/time.js';
import { requireAuth } from '../middleware/auth.js';

const registerSchema = z.object({
  gameId: z
    .string()
    .trim()
    .min(2, '游戏 ID 至少 2 个字符')
    .max(32, '游戏 ID 最多 32 个字符')
    .regex(/^[A-Za-z0-9_]{2,32}$/, '游戏 ID 仅允许字母、数字、下划线'),
  custom: z.record(z.unknown()).optional(),
});

function validateCustomFields(
  fields: RegistrationFieldRow[],
  custom: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const data = custom ?? {};
  for (const field of fields) {
    const value = data[field.key];
    const empty = value === undefined || value === null || value === '';
    if (field.required === 1 && empty) {
      throw errors.invalidRequest(`缺少必填报名字段：${field.label}`, { field: field.key });
    }
    if (empty) continue;
    switch (field.type) {
      case 'number':
        if (typeof value !== 'number' && !(typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) {
          throw errors.invalidRequest(`报名字段 ${field.label} 必须是数字`, { field: field.key });
        }
        break;
      case 'checkbox':
        if (typeof value !== 'boolean' && value !== '1' && value !== '0' && value !== 'true' && value !== 'false') {
          throw errors.invalidRequest(`报名字段 ${field.label} 必须是布尔值`, { field: field.key });
        }
        break;
      case 'select': {
        const options = parseJson<string[]>(field.options, []);
        if (options.length > 0 && !options.includes(String(value))) {
          throw errors.invalidRequest(`报名字段 ${field.label} 的选项不合法`, { field: field.key });
        }
        break;
      }
      case 'text':
      case 'textarea':
      default:
        if (typeof value !== 'string') {
          throw errors.invalidRequest(`报名字段 ${field.label} 必须是文本`, { field: field.key });
        }
    }
  }
  // 只保留已配置字段，避免脏数据
  const allowed = new Set(fields.map((field) => field.key));
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.has(key)) cleaned[key] = value;
  }
  return cleaned;
}

export function createRegistrationsRouter(ctx: AppContext): Router {
  const { db } = ctx;
  const router = Router();

  router.post('/seasons/:id/register', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const body = registerSchema.parse(req.body);
    const seasonId = parseId(req.params.id, '赛季 ID');
    const season = getSeason(db, seasonId);
    if (!season) throw errors.notFound('赛季不存在');

    const needEmail = getSettingBool(db, 'registration_need_email', true);
    if (needEmail && (user.email_verified !== 1 || !user.email)) {
      throw errors.emailUnverified();
    }
    if (!seasonIsRegistrationOpen(season)) {
      throw errors.registrationClosed(`当前赛季为「${seasonStateLabel(season.state)}」，报名未开放（报名时间未到或已结束）`);
    }

    const fields = db
      .prepare('SELECT * FROM registration_fields WHERE season_id = ? ORDER BY sort_order, id')
      .all(season.id) as RegistrationFieldRow[];
    const customData = validateCustomFields(fields, body.custom);

    const existing = db
      .prepare('SELECT * FROM registrations WHERE season_id = ? AND user_id = ?')
      .get(season.id, user.id) as RegistrationRow | undefined;
    if (existing && existing.state === 'active') {
      throw errors.conflict('你已报名该赛季');
    }

    const now = nowIso();
    let registrationId: number;
    if (existing) {
      db.prepare(
        `UPDATE registrations SET game_id = ?, custom_data = ?, state = 'active',
           created_at = ?, revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL
         WHERE id = ?`,
      ).run(body.gameId, JSON.stringify(customData), now, existing.id);
      registrationId = existing.id;
    } else {
      const info = db
        .prepare(
          `INSERT INTO registrations (season_id, user_id, game_id, custom_data, state)
           VALUES (?, ?, ?, ?, 'active')`,
        )
        .run(season.id, user.id, body.gameId, JSON.stringify(customData));
      registrationId = Number(info.lastInsertRowid);
    }

    db.prepare(
      `INSERT OR IGNORE INTO player_statistics (user_id, season_id, points)
       VALUES (?, ?, ?)`,
    ).run(user.id, season.id, season.initial_points);

    // 同步游戏 ID（未验证过的 game_id 也可作为比赛关联兜底）
    if (!user.game_id) {
      db.prepare('UPDATE users SET game_id = ?, updated_at = ? WHERE id = ?').run(
        body.gameId,
        now,
        user.id,
      );
    }

    createNotification(db, {
      userId: user.id,
      type: 'registration_success',
      title: '报名成功',
      content: `你已成功报名「${season.name}」，游戏 ID：${body.gameId}。赛事开始后即可参赛。`,
      link: `/seasons/${season.id}`,
    });

    const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registrationId) as RegistrationRow;
    res.status(200).json({
      ok: true,
      registration: registrationPublic(row, { seasonName: season.name }),
      season: { id: season.id, name: season.name, code: season.code },
    });
  });

  router.get('/me/registrations', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 50 });
    const rows = db
      .prepare(
        `SELECT r.*, s.name AS season_name, s.code AS season_code
         FROM registrations r JOIN seasons s ON s.id = r.season_id
         WHERE r.user_id = ? ORDER BY COALESCE(s.start_at, s.created_at) DESC, r.id DESC`,
      )
      .all(user.id) as Array<RegistrationRow & { season_name: string; season_code: string }>;
    const items = rows.map((row) => ({
      ...registrationPublic(row, { seasonName: row.season_name }),
      seasonCode: row.season_code,
    }));
    res
      .status(200)
      .json(
        listResponse(
          items.slice(pagination.offset, pagination.offset + pagination.limit),
          items.length,
          pagination,
        ),
      );
  });

  router.post('/me/registrations/:id/withdraw', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const id = parseId(req.params.id, '报名 ID');
    const registration = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id) as
      | RegistrationRow
      | undefined;
    if (!registration) throw errors.notFound('报名记录不存在');
    if (registration.user_id !== user.id) throw errors.forbidden('只能退出自己的报名');
    if (registration.state === 'revoked') throw errors.conflict('该报名已取消');
    const season = getSeason(db, registration.season_id);
    if (!season) throw errors.notFound('赛季不存在');
    if (season.state === 'running' || season.state === 'sealed' || season.state === 'archived') {
      throw errors.conflict('赛季已开始，无法退出报名；如需处理请联系管理员');
    }
    const now = nowIso();
    db.prepare(
      `UPDATE registrations SET state = 'revoked', revoked_at = ?, revoke_reason = '用户主动退出'
       WHERE id = ?`,
    ).run(now, registration.id);
    res.status(200).json({ ok: true, id: registration.id, state: 'revoked' });
  });

  return router;
}
