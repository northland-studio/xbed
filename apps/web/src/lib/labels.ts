/** 状态 / 枚举 → 中文文案与配色 */

export type BadgeKind = 'gray' | 'purple' | 'cyan' | 'green' | 'yellow' | 'red' | 'blue';

export const SEASON_STATE: Record<string, string> = {
  draft: '草稿',
  registration: '报名中',
  running: '进行中',
  sealed: '已封存',
  archived: '已归档',
};

export const SEASON_STATE_BADGE: Record<string, BadgeKind> = {
  draft: 'gray',
  registration: 'green',
  running: 'cyan',
  sealed: 'purple',
  archived: 'gray',
};

export const MATCH_STATE: Record<string, string> = {
  pending: '待审核',
  in_review: '审核中',
  rejected: '驳回待补充',
  approved: '已通过',
  abnormal: '异常待裁定',
  resolved: '已裁定',
  void: '已作废',
};

export const MATCH_STATE_BADGE: Record<string, BadgeKind> = {
  pending: 'yellow',
  in_review: 'blue',
  rejected: 'red',
  approved: 'green',
  abnormal: 'red',
  resolved: 'cyan',
  void: 'gray',
};

export const REGISTRATION_STATE: Record<string, string> = {
  active: '有效',
  revoked: '已取消资格',
};

export const EVIDENCE_STATE: Record<string, string> = {
  missing: '缺交',
  submitted: '已提交',
  late: '逾期提交',
  invalid: '无效',
  verified: '已核验',
};

export const EVIDENCE_STATE_BADGE: Record<string, BadgeKind> = {
  missing: 'red',
  submitted: 'green',
  late: 'yellow',
  invalid: 'gray',
  verified: 'cyan',
};

export const APPEAL_STATE: Record<string, string> = {
  open: '待受理',
  processing: '处理中',
  resolved: '已裁决',
  rejected: '已驳回',
};

export const APPEAL_STATE_BADGE: Record<string, BadgeKind> = {
  open: 'yellow',
  processing: 'blue',
  resolved: 'green',
  rejected: 'gray',
};

export const APPEAL_TYPE: Record<string, string> = {
  result: '赛果申诉',
  points: '积分申诉',
  rank: '排名申诉',
};

export const ANN_CATEGORY: Record<string, string> = {
  general: '综合',
  season: '赛季',
  result: '赛果',
  match: '比赛',
  system: '系统',
};

export const NOTIFICATION_TYPE: Record<string, string> = {
  registration: '报名',
  team_invite: '战队邀请',
  match_result: '赛果',
  points: '积分',
  rank: '段位',
  announcement: '公告',
  appeal: '申诉',
  system: '系统',
};

export const EVENT_TYPE: Record<string, string> = {
  kill: '击杀',
  death: '死亡',
  bed_break: '摧毁床',
  join: '加入',
  leave: '退出',
  rejoin: '重连',
  team_eliminated: '队伍淘汰',
  end: '比赛结束',
  game_start: '比赛开始',
};

export const EVENT_TYPE_ICON: Record<string, string> = {
  kill: '⚔',
  death: '☠',
  bed_break: '◇',
  join: '→',
  leave: '←',
  rejoin: '↻',
  team_eliminated: '✕',
  end: '■',
  game_start: '▶',
};

export const POINT_REASON: Record<string, string> = {
  match_win: '比赛胜利',
  match_loss: '比赛失败',
  match_draw: '比赛平局',
  admin_adjust: '管理员调整',
};

export const AUDIT_ACTION: Record<string, string> = {
  match_approve: '赛果通过',
  match_reject: '赛果驳回',
  match_correct: '赛果修正',
  match_resolve: '异常裁定',
  match_void: '比赛作废',
  match_abnormal: '标记异常',
  match_claim: '领取审核',
  points_adjust: '积分调整',
  season_create: '创建赛季',
  season_update: '更新赛季',
  season_state: '赛季状态流转',
  season_rules: '赛季规则变更',
  registration_revoke: '取消报名资格',
  appeal_reply: '申诉回复',
  appeal_resolve: '申诉裁决',
  rank_tier_update: '段位配置变更',
  smtp_update: 'SMTP 配置变更',
  server_create: '创建服务器密钥',
  server_rotate: '轮换服务器密钥',
  server_revoke: '吊销服务器密钥',
  file_delete: '删除证据文件',
  replay_cleanup: '清理回放文件',
  user_update: '用户状态变更',
  team_transfer: '战队队长转让',
  announcement_create: '发布公告',
  announcement_update: '更新公告',
  announcement_delete: '删除公告',
  notification_broadcast: '通知群发',
  settings_update: '系统设置变更',
};

export const AUDIT_ACTION_BADGE: Record<string, BadgeKind> = {
  match_approve: 'green',
  match_reject: 'red',
  match_correct: 'yellow',
  match_resolve: 'cyan',
  match_void: 'gray',
  match_abnormal: 'red',
  points_adjust: 'yellow',
  smtp_update: 'purple',
  server_create: 'cyan',
  server_rotate: 'cyan',
  server_revoke: 'red',
  file_delete: 'red',
  settings_update: 'purple',
};

export const TIER_COLORS = [
  '#8b5cf6',
  '#22d3ee',
  '#fbbf24',
  '#34d399',
  '#f472b6',
  '#60a5fa',
  '#f87171',
  '#a78bfa',
];

export function label(map: Record<string, string>, key?: string | null): string {
  if (!key) return '—';
  return map[key] ?? key;
}

export function badge(map: Record<string, BadgeKind>, key?: string | null): BadgeKind {
  if (!key) return 'gray';
  return map[key] ?? 'gray';
}

export const MATCH_STATE_OPTIONS = Object.entries(MATCH_STATE).map(([value, text]) => ({ value, text }));
export const SEASON_STATE_OPTIONS = Object.entries(SEASON_STATE).map(([value, text]) => ({ value, text }));
export const APPEAL_STATE_OPTIONS = Object.entries(APPEAL_STATE).map(([value, text]) => ({ value, text }));
export const APPEAL_TYPE_OPTIONS = Object.entries(APPEAL_TYPE).map(([value, text]) => ({ value, text }));
export const ANN_CATEGORY_OPTIONS = Object.entries(ANN_CATEGORY).map(([value, text]) => ({ value, text }));
export const REGISTRATION_STATE_OPTIONS = Object.entries(REGISTRATION_STATE).map(([value, text]) => ({
  value,
  text,
}));
