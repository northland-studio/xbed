/** 数据库行类型（better-sqlite3 返回 plain object，这里用于类型断言） */

export interface UserRow {
  id: number;
  xuanjian_user_id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  level: number;
  title: string | null;
  contribution: number;
  is_member: number;
  game_id: string | null;
  email: string | null;
  email_verified: number;
  email_verified_at: string | null;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: number;
  level_snapshot: number;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
}

export interface OAuthAccountRow {
  id: number;
  user_id: number;
  provider: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  access_expires_at: string | null;
  scope: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeasonRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  state: 'draft' | 'registration' | 'running' | 'sealed' | 'archived';
  registration_open: number;
  initial_points: number;
  min_points: number;
  win_points: number;
  loss_points: number;
  draw_points: number;
  match_modes: string | null;
  map_whitelist: string | null;
  reward_note: string | null;
  sealed_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationFieldRow {
  id: number;
  season_id: number;
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  required: number;
  options: string | null;
  sort_order: number;
}

export interface RegistrationRow {
  id: number;
  season_id: number;
  user_id: number;
  game_id: string;
  custom_data: string | null;
  state: 'active' | 'revoked';
  created_at: string;
  revoked_at: string | null;
  revoked_by: number | null;
  revoke_reason: string | null;
}

export interface MatchRow {
  id: number;
  season_id: number | null;
  external_match_id: string;
  server_id: string;
  arena: string | null;
  arena_display: string | null;
  mode: string | null;
  state:
    | 'pending'
    | 'in_review'
    | 'rejected'
    | 'approved'
    | 'abnormal'
    | 'resolved'
    | 'void';
  started_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  winner_team: string | null;
  is_draw: number;
  abnormal_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface MatchPlayerRow {
  id: number;
  match_id: number;
  user_id: number | null;
  uuid: string | null;
  game_id: string;
  team: string | null;
  is_winner: number;
  placement: number | null;
  kills: number;
  final_kills: number;
  deaths: number;
  final_deaths: number;
  beds_broken: number;
  raw_stats: string | null;
}

export interface MatchEventRow {
  id: number;
  match_id: number;
  event_type: string;
  at: string | null;
  actor: string | null;
  target: string | null;
  team: string | null;
  data: string | null;
}

export interface MatchResultRow {
  id: number;
  match_id: number;
  version: number;
  winner_team: string | null;
  is_draw: number;
  players_json: string;
  approved_by: number | null;
  approved_at: string | null;
  note: string | null;
}

export interface MatchEvidenceRow {
  id: number;
  match_id: number;
  user_id: number | null;
  kind: 'latest_log' | 'replay';
  original_name: string | null;
  stored_path: string;
  size_bytes: number;
  sha256: string;
  mime: string | null;
  uploaded_at: string;
  is_late: number;
  verified: number;
  note: string | null;
}

export interface PointTransactionRow {
  id: number;
  season_id: number;
  user_id: number;
  match_id: number | null;
  delta: number;
  reason: string;
  balance_after: number | null;
  created_by: number | null;
  note: string | null;
  created_at: string;
}

export interface PlayerStatisticsRow {
  id: number;
  user_id: number;
  season_id: number;
  points: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  deaths: number;
  beds_broken: number;
  win_rate: number;
  current_streak: number;
  best_streak: number;
  max_kills: number;
  updated_at: string;
}

export interface LifetimeStatisticsRow {
  user_id: number;
  total_points: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  deaths: number;
  updated_at: string;
}

export interface RankTierRow {
  id: number;
  kind: 'season' | 'lifetime';
  season_id: number | null;
  name: string;
  min_points: number;
  color: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
}

export interface MatchAppealRow {
  id: number;
  match_id: number;
  user_id: number;
  type: string;
  content: string;
  state: 'open' | 'processing' | 'resolved' | 'rejected';
  result: string | null;
  result_note: string | null;
  handled_by: number | null;
  handled_at: string | null;
  created_at: string;
}

export interface TeamRow {
  id: number;
  name: string;
  intro: string | null;
  avatar: string | null;
  captain_id: number;
  members_count: number;
  state: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRow {
  id: number;
  team_id: number;
  user_id: number;
  role: 'captain' | 'member';
  joined_at: string;
  left_at: string | null;
}

export interface TeamInvitationRow {
  id: number;
  team_id: number;
  inviter_id: number;
  invitee_id: number;
  state: 'pending' | 'accepted' | 'rejected' | 'expired';
  expires_at: string;
  created_at: string;
}

export interface AnnouncementRow {
  id: number;
  title: string;
  content: string;
  category: string;
  pinned: number;
  published: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: number;
  user_id: number;
  type: string;
  title: string;
  content: string | null;
  link: string | null;
  is_read: number;
  created_at: string;
}

export interface ServerRow {
  id: number;
  server_key: string;
  name: string;
  secret_hash: string;
  secret_enc: string | null;
  state: 'active' | 'revoked';
  note: string | null;
  last_seen_at: string | null;
  created_at: string;
  rotated_at: string | null;
}

export interface AuditLogRow {
  id: number;
  actor_user_id: number | null;
  actor_xuanjian_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before_data: string | null;
  after_data: string | null;
  reason: string | null;
  ip: string | null;
  created_at: string;
}
