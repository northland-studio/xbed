import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import type {
  TeamInvitationRow,
  TeamMemberRow,
  TeamRow,
  UserRow,
} from '../db/models.js';
import { errors } from '../lib/errors.js';
import { createNotification } from '../lib/notifications.js';
import { parseId } from '../lib/pagination.js';
import { teamInvitationPublic, teamPublic } from '../lib/serialize.js';
import { getSettingBool, getSettingNumber } from '../lib/settings.js';
import { addDays, nowIso } from '../lib/time.js';
import { requireAuth } from '../middleware/auth.js';

const createTeamSchema = z.object({
  name: z.string().trim().min(2, '战队名称至少 2 个字符').max(20, '战队名称最多 20 个字符'),
  intro: z.string().trim().max(500, '战队简介最多 500 个字符').optional(),
});

const patchTeamSchema = z.object({
  name: z.string().trim().min(2).max(20).optional(),
  intro: z.string().trim().max(500).optional(),
  avatar: z.string().trim().max(500).optional(),
});

function getActiveTeam(db: AppContext['db'], userId: number): TeamRow | null {
  const row = db
    .prepare(
      `SELECT t.* FROM team_members tm JOIN teams t ON t.id = tm.team_id
       WHERE tm.user_id = ? AND tm.left_at IS NULL AND t.state = 'active' LIMIT 1`,
    )
    .get(userId) as TeamRow | undefined;
  return row ?? null;
}

function loadTeamDetail(db: AppContext['db'], team: TeamRow) {
  const rows = db
    .prepare(
      `SELECT tm.*, u.id AS u_id, u.nickname, u.username, u.avatar AS u_avatar, u.game_id
       FROM team_members tm LEFT JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ? AND tm.left_at IS NULL ORDER BY tm.role = 'captain' DESC, tm.id ASC`,
    )
    .all(team.id) as Array<
    TeamMemberRow & {
      u_id: number | null;
      nickname: string | null;
      username: string | null;
      u_avatar: string | null;
      game_id: string | null;
    }
  >;
  return teamPublic(team, {
    members: rows.map((row) => ({
      member: row,
      user: row.u_id
        ? ({
            id: row.u_id,
            nickname: row.nickname,
            username: row.username,
            avatar: row.u_avatar,
            game_id: row.game_id,
          } as UserRow)
        : null,
    })),
  });
}

function refreshMembersCount(db: AppContext['db'], teamId: number): number {
  const count = (
    db
      .prepare('SELECT COUNT(*) AS c FROM team_members WHERE team_id = ? AND left_at IS NULL')
      .get(teamId) as { c: number }
  ).c;
  db.prepare('UPDATE teams SET members_count = ?, updated_at = ? WHERE id = ?').run(
    count,
    nowIso(),
    teamId,
  );
  return count;
}

function requireCaptain(db: AppContext['db'], userId: number): TeamRow {
  const team = getActiveTeam(db, userId);
  if (!team) throw errors.forbidden('你不是任何战队的队长');
  if (team.captain_id !== userId) throw errors.forbidden('只有队长可以执行该操作');
  return team;
}

export function createMeTeamsRouter(ctx: AppContext): Router {
  const { db } = ctx;
  const router = Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const user = req.auth!.user;
    const team = getActiveTeam(db, user.id);
    const invitations = db
      .prepare(
        `SELECT ti.*, t.name AS team_name, u.nickname AS inviter_nickname
         FROM team_invitations ti JOIN teams t ON t.id = ti.team_id
         LEFT JOIN users u ON u.id = ti.inviter_id
         WHERE ti.invitee_id = ? AND ti.state = 'pending' AND ti.expires_at > ?
         ORDER BY ti.id DESC`,
      )
      .all(user.id, nowIso()) as Array<
      TeamInvitationRow & { team_name: string; inviter_nickname: string | null }
    >;
    res.status(200).json({
      team: team ? loadTeamDetail(db, team) : null,
      invitations: invitations.map((row) =>
        teamInvitationPublic(row, {
          teamName: row.team_name,
          inviterNickname: row.inviter_nickname,
        }),
      ),
    });
  });

  router.post('/', (req, res) => {
    const user = req.auth!.user;
    if (!getSettingBool(db, 'team_create_enabled', true)) {
      throw errors.forbidden('当前不允许创建战队');
    }
    if (getActiveTeam(db, user.id)) throw errors.conflict('你已在一支战队中，需先退出');
    const body = createTeamSchema.parse(req.body);
    const exists = db.prepare('SELECT id FROM teams WHERE name = ?').get(body.name) as
      | { id: number }
      | undefined;
    if (exists) throw errors.conflict('战队名称已被使用');
    const now = nowIso();
    const info = db
      .prepare(
        `INSERT INTO teams (name, intro, captain_id, members_count, state)
         VALUES (?, ?, ?, 1, 'active')`,
      )
      .run(body.name, body.intro ?? null, user.id);
    const teamId = Number(info.lastInsertRowid);
    db.prepare(
      `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'captain', ?)`,
    ).run(teamId, user.id, now);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as TeamRow;
    res.status(200).json({ ok: true, team: loadTeamDetail(db, team) });
  });

  router.patch('/', (req, res) => {
    const user = req.auth!.user;
    const team = requireCaptain(db, user.id);
    const body = patchTeamSchema.parse(req.body);
    if (body.name && body.name !== team.name) {
      const exists = db.prepare('SELECT id FROM teams WHERE name = ? AND id != ?').get(body.name, team.id) as
        | { id: number }
        | undefined;
      if (exists) throw errors.conflict('战队名称已被使用');
    }
    db.prepare(
      `UPDATE teams SET name = COALESCE(?, name), intro = COALESCE(?, intro),
         avatar = COALESCE(?, avatar), updated_at = ? WHERE id = ?`,
    ).run(body.name ?? null, body.intro ?? null, body.avatar ?? null, nowIso(), team.id);
    const updated = db.prepare('SELECT * FROM teams WHERE id = ?').get(team.id) as TeamRow;
    res.status(200).json({ ok: true, team: loadTeamDetail(db, updated) });
  });

  router.post('/invite', (req, res) => {
    const user = req.auth!.user;
    const team = requireCaptain(db, user.id);
    const schema = z.object({ userId: z.number().int().positive() });
    const body = schema.parse(req.body);
    const invitee = db.prepare('SELECT * FROM users WHERE id = ?').get(body.userId) as UserRow | undefined;
    if (!invitee || invitee.status !== 'active') throw errors.notFound('被邀请用户不存在');
    if (invitee.id === user.id) throw errors.invalidRequest('不能邀请自己');
    const maxMembers = getSettingNumber(db, 'team_max_members', 10);
    if (team.members_count >= maxMembers) throw errors.conflict(`战队人数已达上限（${maxMembers}）`);
    if (getActiveTeam(db, invitee.id)) throw errors.conflict('该玩家已在其他战队中');
    const pending = db
      .prepare(
        "SELECT id FROM team_invitations WHERE team_id = ? AND invitee_id = ? AND state = 'pending' AND expires_at > ?",
      )
      .get(team.id, invitee.id, nowIso()) as { id: number } | undefined;
    if (pending) throw errors.conflict('已向该玩家发送过邀请，等待对方处理');

    const expiresAt = addDays(nowIso(), 7);
    const info = db
      .prepare(
        `INSERT INTO team_invitations (team_id, inviter_id, invitee_id, state, expires_at)
         VALUES (?, ?, ?, 'pending', ?)`,
      )
      .run(team.id, user.id, invitee.id, expiresAt);
    createNotification(db, {
      userId: invitee.id,
      type: 'team_invite',
      title: '战队邀请',
      content: `${user.nickname} 邀请你加入战队「${team.name}」。`,
      link: '/me/team',
    });
    res.status(200).json({
      ok: true,
      invitation: {
        id: Number(info.lastInsertRowid),
        teamId: team.id,
        inviteeId: invitee.id,
        expiresAt,
      },
    });
  });

  router.get('/invitations', (req, res) => {
    const user = req.auth!.user;
    const rows = db
      .prepare(
        `SELECT ti.*, t.name AS team_name, u.nickname AS inviter_nickname
         FROM team_invitations ti JOIN teams t ON t.id = ti.team_id
         LEFT JOIN users u ON u.id = ti.inviter_id
         WHERE ti.invitee_id = ? AND ti.state = 'pending' AND ti.expires_at > ?
         ORDER BY ti.id DESC`,
      )
      .all(user.id, nowIso()) as Array<
      TeamInvitationRow & { team_name: string; inviter_nickname: string | null }
    >;
    res.status(200).json({
      items: rows.map((row) =>
        teamInvitationPublic(row, {
          teamName: row.team_name,
          inviterNickname: row.inviter_nickname,
        }),
      ),
      total: rows.length,
      page: 1,
      pageSize: rows.length,
    });
  });

  const handleInvitation = (accept: boolean) => (req: import('express').Request, res: import('express').Response) => {
    const user = req.auth!.user;
    const id = parseId(req.params.id, '邀请 ID');
    const invitation = db.prepare('SELECT * FROM team_invitations WHERE id = ?').get(id) as
      | TeamInvitationRow
      | undefined;
    if (!invitation) throw errors.notFound('邀请不存在');
    if (invitation.invitee_id !== user.id) throw errors.forbidden('无权处理该邀请');
    if (invitation.state !== 'pending') throw errors.conflict('该邀请已处理');
    if (invitation.expires_at < nowIso()) {
      db.prepare("UPDATE team_invitations SET state = 'expired' WHERE id = ?").run(id);
      throw errors.conflict('邀请已过期');
    }
    if (!accept) {
      db.prepare("UPDATE team_invitations SET state = 'rejected' WHERE id = ?").run(id);
      res.status(200).json({ ok: true, state: 'rejected' });
      return;
    }
    if (getActiveTeam(db, user.id)) throw errors.conflict('你已在一支战队中，需先退出当前战队');
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(invitation.team_id) as
      | TeamRow
      | undefined;
    if (!team || team.state !== 'active') throw errors.conflict('战队不存在或已归档');
    const maxMembers = getSettingNumber(db, 'team_max_members', 10);
    if (team.members_count >= maxMembers) throw errors.conflict(`战队人数已达上限（${maxMembers}）`);
    db.prepare(
      `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`,
    ).run(team.id, user.id, nowIso());
    db.prepare("UPDATE team_invitations SET state = 'accepted' WHERE id = ?").run(id);
    refreshMembersCount(db, team.id);
    createNotification(db, {
      userId: team.captain_id,
      type: 'team_member_join',
      title: '战队新成员',
      content: `${user.nickname} 已接受邀请加入战队「${team.name}」。`,
      link: '/me/team',
    });
    const updated = db.prepare('SELECT * FROM teams WHERE id = ?').get(team.id) as TeamRow;
    res.status(200).json({ ok: true, state: 'accepted', team: loadTeamDetail(db, updated) });
  };

  router.post('/invitations/:id/accept', requireAuth, handleInvitation(true));
  router.post('/invitations/:id/reject', requireAuth, handleInvitation(false));

  router.post('/leave', (req, res) => {
    const user = req.auth!.user;
    const team = getActiveTeam(db, user.id);
    if (!team) throw errors.conflict('你当前不在任何战队中');
    if (team.captain_id === user.id) {
      throw errors.forbidden('队长不能直接退出战队，请联系超级管理员转让队长或归档战队');
    }
    db.prepare('UPDATE team_members SET left_at = ? WHERE team_id = ? AND user_id = ? AND left_at IS NULL').run(
      nowIso(),
      team.id,
      user.id,
    );
    refreshMembersCount(db, team.id);
    createNotification(db, {
      userId: team.captain_id,
      type: 'team_member_leave',
      title: '战队成员退出',
      content: `${user.nickname} 已退出战队「${team.name}」。`,
      link: '/me/team',
    });
    res.status(200).json({ ok: true });
  });

  router.post('/members/:userId/remove', (req, res) => {
    const user = req.auth!.user;
    const team = requireCaptain(db, user.id);
    const targetId = parseId(req.params.userId, '用户 ID');
    if (targetId === team.captain_id) throw errors.invalidRequest('不能移除队长本人');
    const member = db
      .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ? AND left_at IS NULL')
      .get(team.id, targetId) as TeamMemberRow | undefined;
    if (!member) throw errors.notFound('该成员不在战队中');
    db.prepare('UPDATE team_members SET left_at = ? WHERE id = ?').run(nowIso(), member.id);
    refreshMembersCount(db, team.id);
    createNotification(db, {
      userId: targetId,
      type: 'team_member_removed',
      title: '被移出战队',
      content: `你已被移出战队长「${team.name}」。`,
      link: '/me/team',
    });
    res.status(200).json({ ok: true });
  });

  return router;
}

export function createTeamsRouter(ctx: AppContext): Router {
  const { db } = ctx;
  const router = Router();

  router.get('/:id', requireAuth, (req, res) => {
    const user = req.auth!.user;
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(parseId(req.params.id, '战队 ID')) as
      | TeamRow
      | undefined;
    if (!team) throw errors.notFound('战队不存在');
    const isMember = Boolean(
      db
        .prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND left_at IS NULL')
        .get(team.id, user.id),
    );
    const level = req.auth?.level ?? 0;
    if (!isMember && level < 1) throw errors.forbidden('战队信息仅对成员和管理员可见');
    res.status(200).json(loadTeamDetail(db, team));
  });

  return router;
}
