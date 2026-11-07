import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app.js';
import type {
  RegistrationFieldRow,
  RegistrationRow,
  SeasonRow,
  UserRow,
} from '../../db/models.js';
import { auditFromRequest } from '../../lib/audit.js';
import { errors } from '../../lib/errors.js';
import { buildLeaderboardSnapshot } from '../../lib/leaderboard.js';
import { broadcastNotification } from '../../lib/notifications.js';
import { listResponse, parseId, parsePagination } from '../../lib/pagination.js';
import {
  parseJson,
  registrationFieldPublic,
  registrationPublic,
  seasonPublic,
} from '../../lib/serialize.js';
import { getSeason, listSeasons } from '../../lib/season.js';
import { nowIso } from '../../lib/time.js';
import { requireSuper } from '../../middleware/auth.js';

const SEASON_STATES = ['draft', 'registration', 'running', 'sealed', 'archived'] as const;

const seasonCreateSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,16}$/, '赛季编号仅允许字母数字_-（1-16 位）'),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(5000).nullish(),
  startAt: z.string().nullish(),
  endAt: z.string().nullish(),
  state: z.enum(SEASON_STATES).optional(),
  registrationOpen: z.boolean().optional(),
  initialPoints: z.number().int().optional(),
  minPoints: z.number().int().optional(),
  winPoints: z.number().int().optional(),
  lossPoints: z.number().int().optional(),
  drawPoints: z.number().int().optional(),
  matchModes: z.array(z.string()).nullish(),
  mapWhitelist: z.array(z.string()).nullish(),
  rewardNote: z.string().max(2000).nullish(),
});

const seasonPatchSchema = seasonCreateSchema.partial().omit({ code: true });

const fieldSchema = z.object({
  key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/, '字段 key 仅允许字母数字下划线'),
  label: z.string().trim().min(1).max(64),
  type: z.enum(['text', 'textarea', 'number', 'select', 'checkbox']),
  required: z.boolean().optional(),
  options: z.array(z.string()).nullish(),
  sortOrder: z.number().int().optional(),
});

function loadSeasonOr404(ctx: AppContext, seasonId: number): SeasonRow {
  const season = getSeason(ctx.db, seasonId);
  if (!season) throw errors.notFound('赛季不存在');
  return season;
}

function loadFieldOr404(ctx: AppContext, seasonId: number, fieldId: number): RegistrationFieldRow {
  const field = ctx.db
    .prepare('SELECT * FROM registration_fields WHERE id = ? AND season_id = ?')
    .get(fieldId, seasonId) as RegistrationFieldRow | undefined;
  if (!field) throw errors.notFound('报名字段不存在');
  return field;
}

export function createSeasonsAdminRouter(ctx: AppContext): Router {
  const { db } = ctx;
  const router = Router();

  router.get('/seasons', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 50 });
    const seasons = listSeasons(db, { includeDrafts: true });
    const items = seasons.map((season) => {
      const registrationCount = (
        db
          .prepare("SELECT COUNT(*) AS c FROM registrations WHERE season_id = ? AND state = 'active'")
          .get(season.id) as { c: number }
      ).c;
      const matchCount = (
        db.prepare('SELECT COUNT(*) AS c FROM matches WHERE season_id = ?').get(season.id) as { c: number }
      ).c;
      const rule = db
        .prepare('SELECT version FROM season_rules WHERE season_id = ? ORDER BY version DESC LIMIT 1')
        .get(season.id) as { version: number } | undefined;
      return {
        ...seasonPublic(season, registrationCount),
        matchCount,
        ruleVersion: rule?.version ?? 0,
      };
    });
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

  router.post('/seasons', requireSuper, (req, res) => {
    const body = seasonCreateSchema.parse(req.body);
    const duplicate = db.prepare('SELECT id FROM seasons WHERE code = ?').get(body.code);
    if (duplicate) throw errors.conflict('赛季编号已存在');
    const info = db
      .prepare(
        `INSERT INTO seasons
           (code, name, description, start_at, end_at, state, registration_open,
            initial_points, min_points, win_points, loss_points, draw_points,
            match_modes, map_whitelist, reward_note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.code,
        body.name,
        body.description ?? null,
        body.startAt ?? null,
        body.endAt ?? null,
        body.state ?? 'draft',
        body.registrationOpen === false ? 0 : 1,
        body.initialPoints ?? 60,
        body.minPoints ?? 0,
        body.winPoints ?? 5,
        body.lossPoints ?? -5,
        body.drawPoints ?? 0,
        body.matchModes ? JSON.stringify(body.matchModes) : null,
        body.mapWhitelist ? JSON.stringify(body.mapWhitelist) : null,
        body.rewardNote ?? null,
        req.auth!.user.id,
      );
    const season = loadSeasonOr404(ctx, Number(info.lastInsertRowid));
    auditFromRequest(db, req, {
      action: 'season.create',
      targetType: 'season',
      targetId: season.id,
      after: seasonPublic(season),
    });
    res.status(200).json(seasonPublic(season, 0));
  });

  router.patch('/seasons/:id', requireSuper, (req, res) => {
    const season = loadSeasonOr404(ctx, parseId(req.params.id, '赛季 ID'));
    const body = seasonPatchSchema.parse(req.body);
    const sealed = season.state === 'sealed' || season.state === 'archived';
    if (sealed) {
      const allowed = new Set(['name', 'description', 'rewardNote']);
      const illegal = Object.keys(body).filter((key) => !allowed.has(key));
      if (illegal.length > 0) {
        throw errors.conflict(`赛季已封存，仅允许修改 ${Array.from(allowed).join(' / ')}（非法字段：${illegal.join(',')}）`);
      }
    }
    const before = seasonPublic(season);
    db.prepare(
      `UPDATE seasons SET
         name = COALESCE(?, name), description = COALESCE(?, description),
         start_at = COALESCE(?, start_at), end_at = COALESCE(?, end_at),
         state = COALESCE(?, state), registration_open = COALESCE(?, registration_open),
         initial_points = COALESCE(?, initial_points), min_points = COALESCE(?, min_points),
         win_points = COALESCE(?, win_points), loss_points = COALESCE(?, loss_points),
         draw_points = COALESCE(?, draw_points),
         match_modes = COALESCE(?, match_modes), map_whitelist = COALESCE(?, map_whitelist),
         reward_note = COALESCE(?, reward_note),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(
      body.name ?? null,
      body.description ?? null,
      body.startAt ?? null,
      body.endAt ?? null,
      body.state ?? null,
      body.registrationOpen === undefined ? null : body.registrationOpen ? 1 : 0,
      body.initialPoints ?? null,
      body.minPoints ?? null,
      body.winPoints ?? null,
      body.lossPoints ?? null,
      body.drawPoints ?? null,
      body.matchModes === undefined ? null : body.matchModes ? JSON.stringify(body.matchModes) : null,
      body.mapWhitelist === undefined ? null : body.mapWhitelist ? JSON.stringify(body.mapWhitelist) : null,
      body.rewardNote ?? null,
      season.id,
    );
    const updated = loadSeasonOr404(ctx, season.id);
    auditFromRequest(db, req, {
      action: 'season.update',
      targetType: 'season',
      targetId: season.id,
      before,
      after: seasonPublic(updated),
    });
    res.status(200).json(seasonPublic(updated));
  });

  router.post('/seasons/:id/state', requireSuper, (req, res) => {
    const season = loadSeasonOr404(ctx, parseId(req.params.id, '赛季 ID'));
    const body = z.object({ state: z.enum(SEASON_STATES), reason: z.string().max(500).optional() }).parse(req.body);
    const allowedTransitions: Record<string, string[]> = {
      draft: ['registration', 'archived'],
      registration: ['running', 'archived'],
      running: ['sealed', 'archived'],
      sealed: ['archived'],
      archived: [],
    };
    if (!allowedTransitions[season.state]?.includes(body.state)) {
      throw errors.conflict(`不允许从 ${season.state} 流转到 ${body.state}`);
    }
    const before = { state: season.state, sealedAt: season.sealed_at };
    const now = nowIso();
    db.transaction(() => {
      if (body.state === 'sealed') {
        const snapshot = buildLeaderboardSnapshot(db, season.id);
        db.prepare('INSERT INTO leaderboard_snapshots (season_id, payload) VALUES (?, ?)').run(
          season.id,
          JSON.stringify(snapshot),
        );
        db.prepare('UPDATE seasons SET state = ?, sealed_at = ?, updated_at = ? WHERE id = ?').run(
          body.state,
          now,
          now,
          season.id,
        );
      } else {
        db.prepare('UPDATE seasons SET state = ?, updated_at = ? WHERE id = ?').run(
          body.state,
          now,
          season.id,
        );
      }
    })();
    const updated = loadSeasonOr404(ctx, season.id);
    auditFromRequest(db, req, {
      action: 'season.state',
      targetType: 'season',
      targetId: season.id,
      before,
      after: { state: updated.state, sealedAt: updated.sealed_at },
      reason: body.reason ?? null,
    });
    if (body.state === 'sealed') {
      broadcastNotification(db, {
        type: 'season_sealed',
        title: `赛季封存：${season.name}`,
        content: '赛季已封存，最终积分、排名与段位已冻结，历史记录永久保留。',
        link: `/seasons/${season.id}`,
      });
    }
    res.status(200).json(seasonPublic(updated));
  });

  router.put('/seasons/:id/rules', requireSuper, (req, res) => {
    const season = loadSeasonOr404(ctx, parseId(req.params.id, '赛季 ID'));
    const body = z
      .object({ payload: z.record(z.unknown()), note: z.string().max(500).nullish() })
      .parse(req.body);
    const latest = db
      .prepare('SELECT MAX(version) AS version FROM season_rules WHERE season_id = ?')
      .get(season.id) as { version: number | null };
    const version = (latest.version ?? 0) + 1;
    db.prepare(
      `INSERT INTO season_rules (season_id, version, payload, note, created_by) VALUES (?, ?, ?, ?, ?)`,
    ).run(season.id, version, JSON.stringify(body.payload), body.note ?? null, req.auth!.user.id);
    auditFromRequest(db, req, {
      action: 'season.rules',
      targetType: 'season',
      targetId: season.id,
      after: { version, payload: body.payload },
    });
    res.status(200).json({ ok: true, seasonId: season.id, version, payload: body.payload });
  });

  router.get('/seasons/:id/fields', requireSuper, (req, res) => {
    const season = loadSeasonOr404(ctx, parseId(req.params.id, '赛季 ID'));
    const fields = db
      .prepare('SELECT * FROM registration_fields WHERE season_id = ? ORDER BY sort_order, id')
      .all(season.id) as RegistrationFieldRow[];
    res.status(200).json({ items: fields.map(registrationFieldPublic), total: fields.length });
  });

  router.post('/seasons/:id/fields', requireSuper, (req, res) => {
    const season = loadSeasonOr404(ctx, parseId(req.params.id, '赛季 ID'));
    const body = fieldSchema.parse(req.body);
    const exists = db
      .prepare('SELECT id FROM registration_fields WHERE season_id = ? AND key = ?')
      .get(season.id, body.key);
    if (exists) throw errors.conflict('字段 key 已存在');
    const info = db
      .prepare(
        `INSERT INTO registration_fields (season_id, key, label, type, required, options, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        season.id,
        body.key,
        body.label,
        body.type,
        body.required ? 1 : 0,
        body.options ? JSON.stringify(body.options) : null,
        body.sortOrder ?? 0,
      );
    const field = loadFieldOr404(ctx, season.id, Number(info.lastInsertRowid));
    auditFromRequest(db, req, {
      action: 'season.field_create',
      targetType: 'registration_field',
      targetId: field.id,
      after: registrationFieldPublic(field),
    });
    res.status(200).json(registrationFieldPublic(field));
  });

  type FieldInput = z.infer<typeof fieldSchema>;
  const patchField = (seasonId: number, field: RegistrationFieldRow, body: Partial<FieldInput>) => {
    const before = registrationFieldPublic(field);
    db.prepare(
      `UPDATE registration_fields SET
         key = COALESCE(?, key), label = COALESCE(?, label), type = COALESCE(?, type),
         required = COALESCE(?, required),
         options = CASE WHEN ? IS NULL THEN options ELSE ? END,
         sort_order = COALESCE(?, sort_order)
       WHERE id = ?`,
    ).run(
      body.key ?? null,
      body.label ?? null,
      body.type ?? null,
      body.required === undefined ? null : body.required ? 1 : 0,
      body.options === undefined ? null : 'set',
      body.options ? JSON.stringify(body.options) : null,
      body.sortOrder ?? null,
      field.id,
    );
    const updated = loadFieldOr404(ctx, seasonId, field.id);
    return { before, updated };
  };

  router.patch('/seasons/:id/fields/:fieldId', requireSuper, (req, res) => {
    const season = loadSeasonOr404(ctx, parseId(req.params.id, '赛季 ID'));
    const field = loadFieldOr404(ctx, season.id, parseId(req.params.fieldId, '字段 ID'));
    const body = fieldSchema.partial().parse(req.body);
    const result = patchField(season.id, field, body);
    auditFromRequest(db, req, {
      action: 'season.field_update',
      targetType: 'registration_field',
      targetId: field.id,
      before: result.before,
      after: registrationFieldPublic(result.updated),
    });
    res.status(200).json(registrationFieldPublic(result.updated));
  });

  // 兼容 API.md 的 collection 写法（body 带 id）
  router.patch('/seasons/:id/fields', requireSuper, (req, res) => {
    const season = loadSeasonOr404(ctx, parseId(req.params.id, '赛季 ID'));
    const body = fieldSchema.partial().extend({ id: z.number().int().positive() }).parse(req.body);
    const field = loadFieldOr404(ctx, season.id, body.id);
    const result = patchField(season.id, field, body);
    auditFromRequest(db, req, {
      action: 'season.field_update',
      targetType: 'registration_field',
      targetId: field.id,
      before: result.before,
      after: registrationFieldPublic(result.updated),
    });
    res.status(200).json(registrationFieldPublic(result.updated));
  });

  const deleteField = (seasonId: number, fieldId: number, req: import('express').Request) => {
    const field = loadFieldOr404(ctx, seasonId, fieldId);
    db.prepare('DELETE FROM registration_fields WHERE id = ?').run(field.id);
    auditFromRequest(ctx.db, req, {
      action: 'season.field_delete',
      targetType: 'registration_field',
      targetId: field.id,
      before: registrationFieldPublic(field),
      reason: '删除报名字段',
    });
    return field;
  };

  router.delete('/seasons/:id/fields/:fieldId', requireSuper, (req, res) => {
    const season = loadSeasonOr404(ctx, parseId(req.params.id, '赛季 ID'));
    const field = deleteField(season.id, parseId(req.params.fieldId, '字段 ID'), req);
    res.status(200).json({ ok: true, id: field.id });
  });

  router.delete('/seasons/:id/fields', requireSuper, (req, res) => {
    const season = loadSeasonOr404(ctx, parseId(req.params.id, '赛季 ID'));
    const body = z.object({ id: z.number().int().positive() }).parse(req.body);
    const field = deleteField(season.id, body.id, req);
    res.status(200).json({ ok: true, id: field.id });
  });

  router.get('/registrations', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const conditions: string[] = [];
    const params: unknown[] = [];
    const seasonId = Number.parseInt(String(req.query.seasonId ?? ''), 10);
    if (Number.isFinite(seasonId)) {
      conditions.push('r.season_id = ?');
      params.push(seasonId);
    }
    if (typeof req.query.state === 'string' && req.query.state) {
      conditions.push('r.state = ?');
      params.push(req.query.state);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM registrations r ${where}`)
        .get(...params) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT r.*, s.name AS season_name, u.nickname, u.username
         FROM registrations r JOIN seasons s ON s.id = r.season_id
         LEFT JOIN users u ON u.id = r.user_id
         ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pagination.limit, pagination.offset) as Array<
      RegistrationRow & { season_name: string; nickname: string | null; username: string | null }
    >;
    res.status(200).json(
      listResponse(
        rows.map((row) => ({
          ...registrationPublic(row, { seasonName: row.season_name }),
          nickname: row.nickname,
          username: row.username,
          customData: parseJson<Record<string, unknown>>(row.custom_data, {}),
        })),
        total,
        pagination,
      ),
    );
  });

  router.post('/registrations/:id/revoke', (req, res) => {
    const registration = db
      .prepare('SELECT * FROM registrations WHERE id = ?')
      .get(parseId(req.params.id, '报名 ID')) as RegistrationRow | undefined;
    if (!registration) throw errors.notFound('报名记录不存在');
    const body = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body);
    if (registration.state === 'revoked') throw errors.conflict('该报名已取消');
    const now = nowIso();
    db.prepare(
      `UPDATE registrations SET state = 'revoked', revoked_at = ?, revoked_by = ?, revoke_reason = ?
       WHERE id = ?`,
    ).run(now, req.auth!.user.id, body.reason, registration.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(registration.user_id) as
      | UserRow
      | undefined;
    if (user) {
      db.prepare(
        'INSERT INTO notifications (user_id, type, title, content) VALUES (?, ?, ?, ?)',
      ).run(
        user.id,
        'registration_revoked',
        '参赛资格被取消',
        `管理员取消了你在该赛季的报名。理由：${body.reason}`,
      );
    }
    auditFromRequest(db, req, {
      action: 'registration.revoke',
      targetType: 'registration',
      targetId: registration.id,
      before: registrationPublic(registration),
      after: { state: 'revoked', reason: body.reason },
      reason: body.reason,
    });
    res.status(200).json({ ok: true, state: 'revoked' });
  });

  return router;
}
