/**
 * XBed API 数据类型
 * 依据 docs/API.md 与 apps/api/db/schema.sql 推导。
 * 前端请求层会把 snake_case 统一转成 camelCase，并兼容 `{items,total,page,pageSize}` 列表信封。
 * 所有字段尽量声明为可选，后端字段缺失时页面做降级展示而不是崩溃。
 */

export interface User {
  id: number;
  xuanjianUserId?: string;
  username?: string;
  nickname?: string;
  avatar?: string | null;
  level?: number;
  title?: string | null;
  contribution?: number;
  isMember?: boolean;
  gameId?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  status?: 'active' | 'disabled';
  createdAt?: string;
  updatedAt?: string;
}

export interface SessionInfo {
  user: User | null;
  level?: number;
  permissions?: string[];
}

export interface RankTier {
  id: number;
  kind?: 'season' | 'lifetime';
  seasonId?: number | null;
  name: string;
  minPoints: number;
  color?: string;
  icon?: string | null;
  sortOrder?: number;
}

export interface Season {
  id: number;
  code?: string;
  name: string;
  description?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  state?: SeasonState;
  registrationOpen?: boolean;
  initialPoints?: number;
  minPoints?: number;
  winPoints?: number;
  lossPoints?: number;
  drawPoints?: number;
  matchModes?: string[] | null;
  mapWhitelist?: string[] | null;
  rewardNote?: string | null;
  sealedAt?: string | null;
  registrationCount?: number;
  matchesCount?: number;
  playerCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type SeasonState = 'draft' | 'registration' | 'running' | 'sealed' | 'archived';

export interface RegistrationField {
  id: number;
  seasonId?: number;
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  required?: boolean;
  options?: string[] | null;
  sortOrder?: number;
}

export interface SeasonDetail extends Season {
  fields?: RegistrationField[];
  rules?: { version: number; payload?: unknown; note?: string; createdAt?: string } | null;
  rulesHistory?: { version: number; payload?: unknown; note?: string; createdAt?: string }[];
  leaderboardTop?: LeaderboardEntry[];
  myRegistration?: Registration | null;
}

export interface LeaderboardEntry {
  rank?: number;
  userId: number;
  nickname?: string;
  username?: string;
  avatar?: string | null;
  gameId?: string | null;
  points?: number;
  matches?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  winRate?: number;
  kills?: number;
  deaths?: number;
  bedsBroken?: number;
  team?: string | null;
  tier?: RankTier | null;
  seasonId?: number;
  seasonName?: string;
}

export interface PlayerStatistics {
  userId?: number;
  seasonId?: number;
  points?: number;
  totalPoints?: number;
  matches?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  kills?: number;
  deaths?: number;
  bedsBroken?: number;
  winRate?: number;
  currentStreak?: number;
  bestStreak?: number;
  maxKills?: number;
  rank?: number;
  tier?: RankTier | null;
}

export interface MatchPlayer {
  id?: number;
  userId?: number | null;
  uuid?: string | null;
  gameId: string;
  nickname?: string | null;
  avatar?: string | null;
  team?: string | null;
  isWinner?: boolean;
  placement?: number | null;
  kills?: number;
  finalKills?: number;
  deaths?: number;
  finalDeaths?: number;
  bedsBroken?: number;
  rawStats?: Record<string, unknown> | null;
  logState?: EvidenceState;
  replayState?: EvidenceState;
}

export interface MatchEvent {
  id?: number;
  type: string;
  at?: string | null;
  actor?: string | null;
  target?: string | null;
  team?: string | null;
  data?: string | null;
}

export interface Match {
  id: number;
  seasonId?: number | null;
  seasonName?: string | null;
  season?: { id: number; name: string; code?: string } | null;
  externalMatchId?: string;
  serverId?: string;
  arena?: string | null;
  arenaDisplay?: string | null;
  mode?: string | null;
  state?: MatchState;
  startedAt?: string | null;
  endedAt?: string | null;
  endReason?: string | null;
  winnerTeam?: string | null;
  isDraw?: boolean;
  abnormalReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: number | null;
  createdAt?: string;
  players?: MatchPlayer[];
  events?: MatchEvent[];
  playerCount?: number;
  evidenceDeadline?: string | null;
  /** 是否为已公布赛果（仅参赛玩家/管理员能看到未公布比赛） */
  published?: boolean;
  /** 当前查看者是否为该场参赛玩家 */
  viewerIsParticipant?: boolean;
  /** 我与该场比赛的证据提交状态（/me/profile 的 recentMatches 才有） */
  logState?: EvidenceState;
  replayState?: EvidenceState;
}

export type MatchState =
  | 'pending'
  | 'in_review'
  | 'rejected'
  | 'approved'
  | 'abnormal'
  | 'resolved'
  | 'void';

export type EvidenceState = 'missing' | 'submitted' | 'late' | 'invalid' | 'verified';

export interface MatchEvidence {
  id: number;
  matchId?: number;
  userId?: number | null;
  nickname?: string | null;
  gameId?: string | null;
  kind: 'latest_log' | 'replay';
  originalName?: string | null;
  sizeBytes?: number;
  sha256?: string | null;
  mime?: string | null;
  uploadedAt?: string | null;
  isLate?: boolean;
  verified?: boolean;
  note?: string | null;
  state?: EvidenceState;
}

export interface EvidenceStatus {
  matchId?: number;
  deadline?: string | null;
  appealDeadline?: string | null;
  logs?: {
    state?: EvidenceState;
    submittedAt?: string | null;
    isLate?: boolean;
    evidenceId?: number | null;
    originalName?: string | null;
    sizeBytes?: number;
  } | null;
  replay?: {
    state?: EvidenceState;
    submittedAt?: string | null;
    isLate?: boolean;
    evidenceId?: number | null;
    originalName?: string | null;
    sizeBytes?: number;
  } | null;
}

export interface MatchReview {
  id: number;
  action: string;
  reason?: string | null;
  reviewerId?: number | null;
  reviewerNickname?: string | null;
  beforeState?: string | null;
  afterState?: string | null;
  createdAt?: string;
}

export interface MatchResultVersion {
  id: number;
  version: number;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string | null;
  changedBy?: number | null;
  changedByNickname?: string | null;
  createdAt?: string;
}

export interface AdminMatchDetail extends Match {
  rawData?: {
    payload?: unknown;
    payloadHash?: string | null;
    schemaVersion?: number;
    receivedAt?: string | null;
  } | null;
  evidence?: MatchEvidence[];
  reviews?: MatchReview[];
  resultVersions?: MatchResultVersion[];
  result?: {
    winnerTeam?: string | null;
    isDraw?: boolean;
    players?: MatchPlayer[];
    approvedAt?: string | null;
    version?: number;
  } | null;
  warnings?: string[];
}

export interface Registration {
  id: number;
  seasonId?: number;
  seasonName?: string | null;
  season?: Season | null;
  userId?: number;
  gameId?: string | null;
  customData?: Record<string, unknown> | null;
  state?: 'active' | 'revoked';
  createdAt?: string;
  revokedAt?: string | null;
  revokeReason?: string | null;
  nickname?: string | null;
  username?: string | null;
  avatar?: string | null;
  emailVerified?: boolean;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  category?: 'general' | 'season' | 'result' | string;
  pinned?: boolean;
  published?: boolean;
  createdAt?: string;
  updatedAt?: string;
  authorNickname?: string | null;
}

export interface Notification {
  id: number;
  type?: string;
  title: string;
  content?: string | null;
  link?: string | null;
  isRead?: boolean;
  createdAt?: string;
}

export interface TeamMember {
  userId: number;
  nickname?: string | null;
  username?: string | null;
  avatar?: string | null;
  gameId?: string | null;
  role?: 'captain' | 'member';
  joinedAt?: string;
}

export interface Team {
  id: number;
  name: string;
  intro?: string | null;
  avatar?: string | null;
  captainId?: number;
  membersCount?: number;
  state?: string;
  members?: TeamMember[];
  createdAt?: string;
  myRole?: 'captain' | 'member' | null;
}

export interface TeamInvitation {
  id: number;
  teamId?: number;
  teamName?: string | null;
  inviterId?: number;
  inviterNickname?: string | null;
  inviteeId?: number;
  state?: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt?: string | null;
  createdAt?: string;
}

export interface MyTeamsData {
  team: Team | null;
  invitations?: TeamInvitation[];
  createEnabled?: boolean;
  minMembers?: number;
  maxMembers?: number;
}

export interface AppealReply {
  id: number;
  userId?: number;
  nickname?: string | null;
  isAdmin?: boolean;
  content: string;
  createdAt?: string;
}

export interface AppealAttachment {
  id: number;
  appealId?: number;
  fileName?: string;
  originalName?: string;
  sizeBytes?: number;
  sha256?: string | null;
  mime?: string | null;
  uploadedAt?: string;
  downloadUrl?: string;
}

export interface Appeal {
  id: number;
  matchId: number;
  userId?: number;
  nickname?: string | null;
  type?: 'result' | 'points' | 'rank' | string;
  content: string;
  state?: 'open' | 'processing' | 'resolved' | 'rejected';
  result?: string | null;
  resultNote?: string | null;
  handledAt?: string | null;
  createdAt?: string;
  replies?: AppealReply[];
  attachments?: AppealAttachment[];
  match?: Match | null;
  user?: User | null;
}

export interface PointTransaction {
  id: number;
  seasonId?: number;
  seasonName?: string | null;
  userId?: number;
  nickname?: string | null;
  matchId?: number | null;
  delta: number;
  reason: string;
  balanceAfter?: number | null;
  note?: string | null;
  createdAt?: string;
  createdBy?: number | null;
}

export interface RankHistoryItem {
  id: number;
  seasonId?: number | null;
  seasonName?: string | null;
  kind?: string;
  fromTier?: string | null;
  toTier: string;
  points?: number;
  createdAt?: string;
}

export interface TrendPoint {
  date?: string;
  points?: number;
  kills?: number;
  wins?: number;
  matches?: number;
  winRate?: number;
}

export interface PlayerHistorySeason {
  seasonId: number;
  seasonName?: string | null;
  seasonCode?: string | null;
  points?: number;
  matches?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  winRate?: number;
  kills?: number;
  deaths?: number;
  rank?: number | null;
  tier?: RankTier | null;
}

export interface PlayerProfile {
  user: User;
  email?: string | null;
  emailVerified?: boolean;
  registrations?: Registration[];
  currentSeason?: PlayerStatistics | null;
  seasons?: PlayerHistorySeason[];
  lifetime?: PlayerStatistics | null;
  lifetimeTier?: RankTier | null;
  records?: {
    maxKills?: number;
    bestStreak?: number;
    bestWinRate?: number;
    totalMatches?: number;
    highestRank?: number | null;
  } | null;
  recentMatches?: Match[];
  trend?: TrendPoint[];
  rankHistory?: RankHistoryItem[];
  stats?: PlayerStatistics | null;
}

export interface OverviewStats {
  seasons?: number;
  matches?: number;
  players?: number;
  totalKills?: number;
  pendingReviews?: number;
  approvedMatches?: number;
  registrations?: number;
}

export interface AdminOverview {
  counts?: {
    users?: number;
    activeUsers?: number;
    seasons?: number;
    matches?: number;
    registrations?: number;
    pendingMatches?: number;
    abnormalMatches?: number;
    pendingAppeals?: number;
    unreadNotifications?: number;
    emailFailed?: number;
    failedSubmissions?: number;
    teams?: number;
    announcements?: number;
    activeServers?: number;
    evidence?: number;
  };
  storage?: StorageStats;
  todos?: { label: string; count?: number; link?: string }[];
  recentAudit?: AuditLog[];
  db?: { ok?: boolean; sizeBytes?: number | null; walBytes?: number; tables?: number; journalMode?: string; file?: string };
  system?: { node?: string; platform?: string; uptime?: number; filesDir?: string };
  uptime?: number;
}

export interface StorageStats {
  totalBytes?: number;
  logBytes?: number;
  replayBytes?: number;
  logCount?: number;
  replayCount?: number;
  fileCount?: number;
  totalFiles?: number;
  diskFreeBytes?: number;
  diskTotalBytes?: number;
}

export interface StorageFile {
  id: number;
  matchId?: number | null;
  userId?: number | null;
  nickname?: string | null;
  gameId?: string | null;
  kind?: 'latest_log' | 'replay' | string;
  originalName?: string | null;
  sizeBytes?: number;
  sha256?: string | null;
  uploadedAt?: string | null;
  isLate?: boolean;
}

export interface AuditLog {
  id: number;
  actorUserId?: number | null;
  actorNickname?: string | null;
  actorXuanjianId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  reason?: string | null;
  ip?: string | null;
  createdAt?: string;
}

export interface ServerCredential {
  id: number;
  serverKey: string;
  name?: string | null;
  state?: 'active' | 'revoked';
  note?: string | null;
  lastSeenAt?: string | null;
  rotatedAt?: string | null;
  createdAt?: string;
  secret?: string;
  secretHash?: string | null;
}

export interface SmtpSettings {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  passMasked?: string;
  fromName?: string;
  fromEmail?: string;
  configured?: boolean;
}

export interface SystemSetting {
  key: string;
  value: string;
  isSecret?: boolean;
  updatedAt?: string;
}

export interface BroadcastItem {
  id: number;
  title: string;
  content: string;
  link?: string | null;
  recipients?: number;
  createdAt?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
