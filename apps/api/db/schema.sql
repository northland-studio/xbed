-- XBed S1 数据库结构（SQLite，WAL）
-- 约定：时间戳统一为 TEXT ISO8601（UTC，如 2026-11-08T10:00:00.000Z）
-- 所有表使用 INTEGER PRIMARY KEY 自增；历史/审计类表只允许 INSERT。

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ========== 用户与身份 ==========
CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  xuanjian_user_id      TEXT    NOT NULL UNIQUE,       -- 玄剑 OAuth 用户 ID（唯一外部标识）
  username              TEXT    NOT NULL,
  nickname              TEXT    NOT NULL,
  avatar                TEXT,
  level                 INTEGER NOT NULL DEFAULT 0,    -- 玄剑等级，-1 为托管系统账号（禁止进入体系）
  title                 TEXT,
  contribution          REAL    NOT NULL DEFAULT 0,    -- 只读展示
  is_member             INTEGER NOT NULL DEFAULT 0,
  game_id               TEXT,                          -- Minecraft 游戏 ID（OAuth 同步）
  email                 TEXT,
  email_verified        INTEGER NOT NULL DEFAULT 0,
  email_verified_at     TEXT,
  status                TEXT    NOT NULL DEFAULT 'active', -- active | disabled
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           TEXT    NOT NULL DEFAULT 'xuanjian',
  access_token_enc   TEXT,            -- AES-256-GCM 加密
  refresh_token_enc  TEXT,
  access_expires_at  TEXT,
  scope              TEXT,
  last_login_at      TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,          -- 随机会话 ID（cookie 内保存）
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_snapshot INTEGER NOT NULL,         -- 登录时快照，本会话不刷新
  ip            TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);

-- OAuth state（一次性，5 分钟过期；API.md 要求 state 单次有效，用 DB 存储）
CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,          -- 随机 state
  redirect   TEXT,                      -- 登录成功后前端跳转路径
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_exp ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS email_verifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT    NOT NULL,
  code_hash   TEXT    NOT NULL,
  purpose     TEXT    NOT NULL DEFAULT 'verify_email',
  ip          TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_emailver_user ON email_verifications(user_id);

-- ========== 赛季 ==========
CREATE TABLE IF NOT EXISTS seasons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT    NOT NULL UNIQUE,          -- 如 S1
  name              TEXT    NOT NULL,
  description       TEXT,
  start_at          TEXT,
  end_at            TEXT,
  state             TEXT    NOT NULL DEFAULT 'draft', -- draft|registration|running|sealed|archived
  registration_open INTEGER NOT NULL DEFAULT 1,
  initial_points    INTEGER NOT NULL DEFAULT 60,
  min_points        INTEGER NOT NULL DEFAULT 0,
  win_points        INTEGER NOT NULL DEFAULT 5,
  loss_points       INTEGER NOT NULL DEFAULT -5,
  draw_points       INTEGER NOT NULL DEFAULT 0,
  match_modes       TEXT,                             -- JSON 数组：允许计入的模式，空=全部
  map_whitelist     TEXT,                             -- JSON 数组：允许的地图，空=全部
  reward_note       TEXT,
  sealed_at         TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS season_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id   INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  payload     TEXT    NOT NULL,   -- JSON 快照（整套规则）
  note        TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(season_id, version)
);

CREATE TABLE IF NOT EXISTS registration_fields (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id   INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  key         TEXT    NOT NULL,
  label       TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'text', -- text|textarea|number|select|checkbox
  required    INTEGER NOT NULL DEFAULT 0,
  options     TEXT,   -- JSON 数组（select 用）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(season_id, key)
);

CREATE TABLE IF NOT EXISTS registrations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id    INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id      TEXT    NOT NULL,
  custom_data  TEXT,                              -- JSON：{field_key: value}
  state        TEXT    NOT NULL DEFAULT 'active', -- active|revoked
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at   TEXT,
  revoked_by   INTEGER REFERENCES users(id),
  revoke_reason TEXT,
  UNIQUE(season_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reg_season ON registrations(season_id);

-- ========== 比赛 ==========
CREATE TABLE IF NOT EXISTS matches (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id          INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
  external_match_id  TEXT    NOT NULL,             -- 插件生成的比赛 UUID
  server_id          TEXT    NOT NULL DEFAULT 's1',
  arena              TEXT,
  arena_display      TEXT,
  mode               TEXT,                          -- 如 4v4v4v4
  state              TEXT    NOT NULL DEFAULT 'pending', -- pending|in_review|rejected|approved|abnormal|resolved|void
  started_at         TEXT,
  ended_at           TEXT,
  end_reason         TEXT,
  winner_team        TEXT,
  is_draw            INTEGER NOT NULL DEFAULT 0,
  abnormal_reason    TEXT,
  submitted_at       TEXT,
  reviewed_at        TEXT,
  reviewed_by        INTEGER REFERENCES users(id),
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(server_id, external_match_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_state ON matches(state);
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id);

CREATE TABLE IF NOT EXISTS match_raw_data (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id      INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  payload       TEXT    NOT NULL,     -- 插件上报的原始 JSON（不可覆盖）
  payload_hash  TEXT    NOT NULL,     -- SHA-256
  schema_version INTEGER NOT NULL DEFAULT 1,
  received_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_raw_match ON match_raw_data(match_id);

CREATE TABLE IF NOT EXISTS match_players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id      INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id),      -- 可为空（未绑定玄剑账号）
  uuid          TEXT,
  game_id       TEXT    NOT NULL,
  team          TEXT,
  is_winner     INTEGER NOT NULL DEFAULT 0,
  placement     INTEGER,
  kills         INTEGER NOT NULL DEFAULT 0,
  final_kills   INTEGER NOT NULL DEFAULT 0,
  deaths        INTEGER NOT NULL DEFAULT 0,
  final_deaths  INTEGER NOT NULL DEFAULT 0,
  beds_broken   INTEGER NOT NULL DEFAULT 0,
  raw_stats     TEXT,                              -- JSON 其他可用统计
  UNIQUE(match_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_mp_user ON match_players(user_id);
CREATE INDEX IF NOT EXISTS idx_mp_match ON match_players(match_id);

CREATE TABLE IF NOT EXISTS match_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type  TEXT    NOT NULL,   -- kill|death|bed_break|join|leave|rejoin|team_eliminated|end
  at          TEXT,
  actor       TEXT,
  target      TEXT,
  team        TEXT,
  data        TEXT
);
CREATE INDEX IF NOT EXISTS idx_me_match ON match_events(match_id);

CREATE TABLE IF NOT EXISTS match_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id      INTEGER NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL DEFAULT 1,
  winner_team   TEXT,
  is_draw       INTEGER NOT NULL DEFAULT 0,
  players_json  TEXT    NOT NULL,  -- 审核确认后的最终玩家统计
  approved_by   INTEGER REFERENCES users(id),
  approved_at   TEXT,
  note          TEXT
);

CREATE TABLE IF NOT EXISTS match_result_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id     INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  before_json  TEXT,
  after_json   TEXT    NOT NULL,
  reason       TEXT,
  changed_by   INTEGER REFERENCES users(id),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS match_reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  action      TEXT    NOT NULL,   -- claim|approve|reject|correct|resolve|void|abnormal
  reason      TEXT,
  before_state TEXT,
  after_state  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_mr_match ON match_reviews(match_id);

-- ========== 证据文件 ==========
CREATE TABLE IF NOT EXISTS match_evidence (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id     INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id),
  kind         TEXT    NOT NULL,  -- latest_log | replay
  original_name TEXT,
  stored_path  TEXT    NOT NULL,  -- 相对私有目录
  size_bytes   INTEGER NOT NULL,
  sha256       TEXT    NOT NULL,
  mime         TEXT,
  uploaded_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  is_late      INTEGER NOT NULL DEFAULT 0,
  verified     INTEGER NOT NULL DEFAULT 1,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_ev_match ON match_evidence(match_id);
CREATE INDEX IF NOT EXISTS idx_ev_user ON match_evidence(user_id);

CREATE TABLE IF NOT EXISTS match_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evidence_id INTEGER REFERENCES match_evidence(id),
  state      TEXT NOT NULL DEFAULT 'missing', -- missing|submitted|late|invalid
  submitted_at TEXT,
  UNIQUE(match_id, user_id)
);

CREATE TABLE IF NOT EXISTS match_replays (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evidence_id INTEGER REFERENCES match_evidence(id),
  state       TEXT NOT NULL DEFAULT 'missing',
  submitted_at TEXT,
  UNIQUE(match_id, user_id)
);

-- ========== 积分 / 统计 / 段位 ==========
CREATE TABLE IF NOT EXISTS point_transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id   INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id    INTEGER REFERENCES matches(id),
  delta       INTEGER NOT NULL,
  reason      TEXT    NOT NULL,   -- match_win|match_loss|match_draw|admin_adjust
  balance_after INTEGER,
  created_by  INTEGER REFERENCES users(id),
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(season_id, user_id, match_id, reason)
);
CREATE INDEX IF NOT EXISTS idx_pt_season_user ON point_transactions(season_id, user_id);

CREATE TABLE IF NOT EXISTS player_statistics (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id       INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  points          INTEGER NOT NULL DEFAULT 0,
  matches         INTEGER NOT NULL DEFAULT 0,
  wins            INTEGER NOT NULL DEFAULT 0,
  losses          INTEGER NOT NULL DEFAULT 0,
  draws           INTEGER NOT NULL DEFAULT 0,
  kills           INTEGER NOT NULL DEFAULT 0,
  deaths          INTEGER NOT NULL DEFAULT 0,
  beds_broken     INTEGER NOT NULL DEFAULT 0,
  win_rate        REAL    NOT NULL DEFAULT 0,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  best_streak     INTEGER NOT NULL DEFAULT 0,
  max_kills       INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, season_id)
);
CREATE INDEX IF NOT EXISTS idx_ps_season_points ON player_statistics(season_id, points DESC);

CREATE TABLE IF NOT EXISTS lifetime_statistics (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,   -- 历史累计竞技积分（跨赛季累加）
  matches      INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,
  losses       INTEGER NOT NULL DEFAULT 0,
  draws        INTEGER NOT NULL DEFAULT 0,
  kills        INTEGER NOT NULL DEFAULT 0,
  deaths       INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id   INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  payload     TEXT    NOT NULL,  -- JSON：最终排行榜
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS rank_tiers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL,   -- season | lifetime
  season_id   INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  min_points  INTEGER NOT NULL,
  color       TEXT    NOT NULL DEFAULT '#8b5cf6',
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_rt_kind ON rank_tiers(kind, season_id);

CREATE TABLE IF NOT EXISTS rank_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id   INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,
  from_tier   TEXT,
  to_tier     TEXT    NOT NULL,
  points      INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_rh_user ON rank_history(user_id);

-- ========== 申诉 ==========
CREATE TABLE IF NOT EXISTS match_appeals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL DEFAULT 'result',  -- result|points|rank
  content     TEXT    NOT NULL,
  state       TEXT    NOT NULL DEFAULT 'open',    -- open|processing|resolved|rejected
  result      TEXT,
  result_note TEXT,
  handled_by  INTEGER REFERENCES users(id),
  handled_at  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_appeals_match ON match_appeals(match_id);

CREATE TABLE IF NOT EXISTS appeal_replies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  appeal_id  INTEGER NOT NULL REFERENCES match_appeals(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  is_admin   INTEGER NOT NULL DEFAULT 0,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS appeal_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  appeal_id     INTEGER NOT NULL REFERENCES match_appeals(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  original_name TEXT,
  stored_path   TEXT    NOT NULL,  -- 相对 FILES_DIR，如 appeals/<appealId>/<random>.zip
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT    NOT NULL,
  mime          TEXT,
  uploaded_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_appeal_attachment ON appeal_attachments(appeal_id);

-- ========== 战队 ==========
CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  intro       TEXT,
  avatar      TEXT,
  captain_id  INTEGER NOT NULL REFERENCES users(id),
  members_count INTEGER NOT NULL DEFAULT 1,
  state       TEXT    NOT NULL DEFAULT 'active', -- active|archived
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS team_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'member',  -- captain|member
  joined_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  left_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_tm_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_tm_user ON team_members(user_id);

CREATE TABLE IF NOT EXISTS team_invitations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  inviter_id  INTEGER NOT NULL REFERENCES users(id),
  invitee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state       TEXT    NOT NULL DEFAULT 'pending', -- pending|accepted|rejected|expired
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ti_invitee ON team_invitations(invitee_id);

-- ========== 公告 / 通知 / 邮件 ==========
CREATE TABLE IF NOT EXISTS announcements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  category    TEXT    NOT NULL DEFAULT 'general', -- general|season|result
  pinned      INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  content    TEXT,
  link       TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS email_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  to_email    TEXT    NOT NULL,
  subject     TEXT    NOT NULL,
  template    TEXT,
  state       TEXT    NOT NULL DEFAULT 'queued', -- queued|sent|failed
  error       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at     TEXT
);

-- ========== 服务器接入 / 审计 / 配置 ==========
CREATE TABLE IF NOT EXISTS servers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  server_key    TEXT    NOT NULL UNIQUE,   -- 如 s1
  name          TEXT    NOT NULL,
  secret_hash   TEXT    NOT NULL,          -- HMAC 密钥的 SHA-256（密钥明文仅创建时返回）
  secret_enc    TEXT,                      -- AES 加密保存，便于后台轮换展示策略
  state         TEXT    NOT NULL DEFAULT 'active', -- active|revoked
  note          TEXT,
  last_seen_at  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  rotated_at    TEXT
);

CREATE TABLE IF NOT EXISTS server_nonces (
  nonce      TEXT PRIMARY KEY,
  server_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS server_submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  server_key   TEXT    NOT NULL,
  external_match_id TEXT,
  match_id     INTEGER REFERENCES matches(id),
  payload_hash TEXT,
  state        TEXT    NOT NULL,  -- accepted|duplicate|rejected
  error        TEXT,
  ip           TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ss_server ON server_submissions(server_key, external_match_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_xuanjian_id TEXT,
  action        TEXT    NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  before_data   TEXT,
  after_data    TEXT,
  reason        TEXT,
  ip            TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at);

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  is_secret  INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ========== 默认数据 ==========
INSERT OR IGNORE INTO system_settings(key, value) VALUES
  ('site_name', 'XBed 玄剑起床战争挑战赛'),
  ('registration_need_email', '1'),
  ('evidence_deadline_minutes', '60'),
  ('appeal_deadline_hours', '48'),
  ('team_create_enabled', '1'),
  ('team_min_members', '2'),
  ('team_max_members', '10'),
  ('upload_max_latest_log_mb', '20'),
  ('upload_max_mcpr_mb', '300');
