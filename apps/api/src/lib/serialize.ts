import type {
  AnnouncementRow,
  AuditLogRow,
  MatchAppealRow,
  MatchEventRow,
  MatchEvidenceRow,
  MatchPlayerRow,
  MatchResultRow,
  MatchRow,
  NotificationRow,
  PlayerStatisticsRow,
  PointTransactionRow,
  RankTierRow,
  RegistrationFieldRow,
  RegistrationRow,
  SeasonRow,
  TeamInvitationRow,
  TeamMemberRow,
  TeamRow,
  UserRow,
} from '../db/models.js';

export function asBool(value: number | boolean | null | undefined): boolean {
  return value === 1 || value === true;
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 公开用户信息（默认不含邮箱等隐私字段） */
export function publicUser(user: UserRow, options: { includePrivate?: boolean } = {}) {
  const base = {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    level: user.level,
    title: user.title,
    contribution: user.contribution,
    isMember: asBool(user.is_member),
    gameId: user.game_id,
    status: user.status,
    createdAt: user.created_at,
  };
  if (options.includePrivate) {
    return {
      ...base,
      email: user.email,
      emailVerified: asBool(user.email_verified),
      emailVerifiedAt: user.email_verified_at,
      updatedAt: user.updated_at,
    };
  }
  return base;
}

export function userBrief(user: Partial<UserRow> | null | undefined) {
  if (!user) return null;
  return {
    id: user.id ?? null,
    username: user.username ?? null,
    nickname: user.nickname ?? '',
    avatar: user.avatar ?? null,
    gameId: user.game_id ?? null,
  };
}

export function seasonPublic(row: SeasonRow, registrationCount?: number) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    state: row.state,
    registrationOpen: asBool(row.registration_open),
    initialPoints: row.initial_points,
    minPoints: row.min_points,
    winPoints: row.win_points,
    lossPoints: row.loss_points,
    drawPoints: row.draw_points,
    matchModes: parseJson<string[] | null>(row.match_modes, null),
    mapWhitelist: parseJson<string[] | null>(row.map_whitelist, null),
    rewardNote: row.reward_note,
    sealedAt: row.sealed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(registrationCount === undefined ? {} : { registrationCount }),
  };
}

export function registrationFieldPublic(row: RegistrationFieldRow) {
  return {
    id: row.id,
    seasonId: row.season_id,
    key: row.key,
    label: row.label,
    type: row.type,
    required: asBool(row.required),
    options: parseJson<string[] | null>(row.options, null),
    sortOrder: row.sort_order,
  };
}

export function registrationPublic(row: RegistrationRow, extra: { seasonName?: string | null } = {}) {
  return {
    id: row.id,
    seasonId: row.season_id,
    seasonName: extra.seasonName ?? null,
    userId: row.user_id,
    gameId: row.game_id,
    customData: parseJson<Record<string, unknown>>(row.custom_data, {}),
    state: row.state,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  };
}

export function matchPlayerPublic(row: MatchPlayerRow, nickname?: string | null) {
  return {
    id: row.id,
    userId: row.user_id,
    uuid: row.uuid,
    gameId: row.game_id,
    nickname: nickname ?? null,
    team: row.team,
    isWinner: asBool(row.is_winner),
    placement: row.placement,
    kills: row.kills,
    finalKills: row.final_kills,
    deaths: row.deaths,
    finalDeaths: row.final_deaths,
    bedsBroken: row.beds_broken,
  };
}

export function matchEventPublic(row: MatchEventRow) {
  return {
    id: row.id,
    type: row.event_type,
    at: row.at,
    actor: row.actor,
    target: row.target,
    team: row.team,
    data: parseJson<Record<string, unknown> | null>(row.data, null),
  };
}

export function matchPublic(
  row: MatchRow,
  extra: {
    players?: MatchPlayerRow[];
    nicknames?: Map<number, string>;
    events?: MatchEventRow[];
    season?: { id: number; name: string; code: string } | null;
    hasResult?: boolean;
  } = {},
) {
  const base = {
    id: row.id,
    seasonId: row.season_id,
    externalMatchId: row.external_match_id,
    serverId: row.server_id,
    arena: row.arena,
    arenaDisplay: row.arena_display,
    mode: row.mode,
    state: row.state,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    winnerTeam: row.winner_team,
    isDraw: asBool(row.is_draw),
    abnormalReason: row.abnormal_reason,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    ...(extra.season ? { season: extra.season } : {}),
    ...(extra.hasResult === undefined ? {} : { hasResult: extra.hasResult }),
  };
  if (extra.players) {
    return {
      ...base,
      players: extra.players.map((player) =>
        matchPlayerPublic(player, player.user_id ? extra.nicknames?.get(player.user_id) : null),
      ),
      events: (extra.events ?? []).map(matchEventPublic),
    };
  }
  return base;
}

export function evidencePublic(row: MatchEvidenceRow, extra: { gameId?: string | null } = {}) {
  return {
    id: row.id,
    matchId: row.match_id,
    userId: row.user_id,
    gameId: extra.gameId ?? null,
    kind: row.kind,
    originalName: row.original_name,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    mime: row.mime,
    uploadedAt: row.uploaded_at,
    isLate: asBool(row.is_late),
    verified: asBool(row.verified),
    state: asBool(row.is_late) ? 'late' : 'submitted',
  };
}

export function announcementPublic(row: AnnouncementRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    pinned: asBool(row.pinned),
    published: asBool(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function notificationPublic(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    link: row.link,
    isRead: asBool(row.is_read),
    createdAt: row.created_at,
  };
}

export function statisticsPublic(row: PlayerStatisticsRow, extra: Record<string, unknown> = {}) {
  return {
    userId: row.user_id,
    seasonId: row.season_id,
    points: row.points,
    matches: row.matches,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    kills: row.kills,
    deaths: row.deaths,
    bedsBroken: row.beds_broken,
    winRate: row.win_rate,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    maxKills: row.max_kills,
    ...extra,
  };
}

export function pointTransactionPublic(row: PointTransactionRow, extra: { nickname?: string | null } = {}) {
  return {
    id: row.id,
    seasonId: row.season_id,
    userId: row.user_id,
    nickname: extra.nickname ?? null,
    matchId: row.match_id,
    delta: row.delta,
    reason: row.reason,
    balanceAfter: row.balance_after,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function rankTierPublic(row: RankTierRow) {
  return {
    id: row.id,
    kind: row.kind,
    seasonId: row.season_id,
    name: row.name,
    minPoints: row.min_points,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
  };
}

export function tierBrief(row: RankTierRow | null | undefined) {
  if (!row) return null;
  return { name: row.name, color: row.color, icon: row.icon, minPoints: row.min_points };
}

export function appealPublic(
  row: MatchAppealRow,
  extra: {
    replies?: Array<{
      id: number;
      content: string;
      isAdmin: boolean;
      createdAt: string;
      nickname: string | null;
      userId: number;
    }>;
    match?: { id: number; arenaDisplay: string | null; endedAt: string | null } | null;
  } = {},
) {
  return {
    id: row.id,
    matchId: row.match_id,
    userId: row.user_id,
    type: row.type,
    content: row.content,
    state: row.state,
    result: row.result,
    resultNote: row.result_note,
    handledBy: row.handled_by,
    handledAt: row.handled_at,
    createdAt: row.created_at,
    ...(extra.match === undefined ? {} : { match: extra.match }),
    replies: extra.replies ?? [],
  };
}

export function teamMemberPublic(row: TeamMemberRow, user?: Partial<UserRow> | null) {
  return {
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    nickname: user?.nickname ?? null,
    username: user?.username ?? null,
    avatar: user?.avatar ?? null,
    gameId: user?.game_id ?? null,
  };
}

export function teamPublic(
  row: TeamRow,
  extra: {
    members?: Array<{ member: TeamMemberRow; user: UserRow | null }>;
    captainNickname?: string | null;
  } = {},
) {
  return {
    id: row.id,
    name: row.name,
    intro: row.intro,
    avatar: row.avatar,
    captainId: row.captain_id,
    captainNickname: extra.captainNickname ?? null,
    membersCount: row.members_count,
    state: row.state,
    createdAt: row.created_at,
    ...(extra.members
      ? { members: extra.members.map((item) => teamMemberPublic(item.member, item.user)) }
      : {}),
  };
}

export function teamInvitationPublic(
  row: TeamInvitationRow,
  extra: { teamName?: string | null; inviterNickname?: string | null } = {},
) {
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: extra.teamName ?? null,
    inviterId: row.inviter_id,
    inviterNickname: extra.inviterNickname ?? null,
    inviteeId: row.invitee_id,
    state: row.state,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function matchResultPublic(row: MatchResultRow) {
  return {
    id: row.id,
    matchId: row.match_id,
    version: row.version,
    winnerTeam: row.winner_team,
    isDraw: asBool(row.is_draw),
    players: parseJson<unknown[]>(row.players_json, []),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    note: row.note,
  };
}

export function auditPublic(row: AuditLogRow, actorNickname?: string | null) {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorNickname: actorNickname ?? null,
    actorXuanjianId: row.actor_xuanjian_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    beforeData: parseJson<unknown>(row.before_data, null),
    afterData: parseJson<unknown>(row.after_data, null),
    ip: row.ip,
    createdAt: row.created_at,
  };
}
