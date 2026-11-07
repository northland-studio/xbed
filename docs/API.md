# XBed S1 API 契约（v1）

Base: `https://xbed.xuanjian.top/api`（开发 `http://127.0.0.1:3939/api`）

约定：
- JSON 请求/响应；`Content-Type: application/json`
- 成功：HTTP 200 + 业务数据；列表统一 `{ items, total, page, pageSize }`
- 失败：`{ error: { code, message } }`，HTTP 4xx/5xx
- 认证：HttpOnly Cookie `xbed_sess`（服务端 session）。所有写操作校验 `Origin` 与 Cookie 同源。
- 权限：`level>=1` 管理员，`level>=2` 超级管理员（来自登录时 OAuth level 快照）。
- 时间：ISO8601 UTC 字符串。

## 公共接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 `{ ok, db, uptime }` |
| GET | `/stats/overview` | 首页统计：赛季数、比赛数、玩家数、总击杀、待审数（公开部分） |
| GET | `/seasons` | 赛季列表（默认只返回已发布：`registration\|running\|sealed\|archived`） |
| GET | `/seasons/:id` | 赛季详情 + 报名人数 + 当前排行榜 Top10 + 报名字段 |
| GET | `/seasons/:id/leaderboard?page&pageSize` | 赛季排行榜（积分↓ 胜率↓ 击杀↓） |
| GET | `/seasons/:id/matches?page&pageSize` | 该赛季比赛列表（仅 approved） |
| GET | `/matches?state&seasonId&page&pageSize` | 比赛列表（公开只返回 approved/resolved） |
| GET | `/matches/:id` | 比赛详情：基础信息、玩家统计、事件时间线（不含原始日志/回放下载） |
| GET | `/players/:userId` | 玩家公开档案：资料、赛季统计、历史赛季排名、段位、最佳纪录、近 20 场 |
| GET | `/players/:userId/matches?page` | 玩家比赛历史（approved） |
| GET | `/announcements?page` | 公告列表 |
| GET | `/announcements/:id` | 公告详情 |
| GET | `/rank-tiers?seasonId` | 段位配置（公开） |
| GET | `/teams/:id` | 战队详情（仅成员或管理员可见，需登录） |

## 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/auth/login?redirect=` | 生成 state 存 cookie，302 到玄剑 authorize |
| GET | `/auth/callback?code&state` | 校验 state → 换 token → verify 用户 → 成员校验 → upsert user → 建 session → 302 前端 |
| POST | `/auth/logout` | 销毁 session |
| GET | `/auth/me` | 当前会话 `{ user, level, permissions }`，未登录 `{ user: null }` |

要求：
- state 单次有效（存 DB 或签名 cookie，5 分钟过期）
- 成员校验：`is_member===true`；`level===-1` 拒绝
- 同步字段：username/nickname/avatar/level/title/contribution/is_member/game_id
- refresh_token 加密保存，自动轮换（定时/按需）

## 当前用户

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/me/profile` | 完整个人中心：资料+邮箱状态+参赛+统计+段位+最佳纪录+趋势 |
| PATCH | `/me/profile` | 修改 game_id（未报名赛季时允许） |
| POST | `/me/email/send` | 发送邮箱验证码（需登录；频率限制 60s，1h 内 8 次） |
| POST | `/me/email/verify` | 提交验证码完成绑定 |
| GET | `/me/notifications?page&unread` | 通知列表 + 未读数 |
| POST | `/me/notifications/read` | body `{ ids:[] }` 或 `{ all:true }` |
| POST | `/me/teams` | 创建战队 `{ name, intro }` |
| PATCH | `/me/teams` | 修改战队资料（队长） |
| POST | `/me/teams/invite` | `{ userId }` 邀请（队长） |
| GET | `/me/teams/invitations` | 我的待处理邀请 |
| POST | `/me/teams/invitations/:id/accept` / `reject` | 处理邀请 |
| POST | `/me/teams/leave` | 退出战队 |
| POST | `/me/teams/members/:userId/remove` | 移除成员（队长） |

## 报名

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/seasons/:id/register` | body `{ game_id, custom: {} }`；需邮箱已验证；自动通过 |
| GET | `/me/registrations` | 我的报名记录 |
| POST | `/me/registrations/:id/withdraw` | 退出报名（开赛后禁止） |

## 证据上传（玩家）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/matches/:id/evidence/log` | multipart `file`（.log/.txt ≤20MB），流式 SHA-256，逾期标记 is_late |
| POST | `/matches/:id/evidence/replay` | multipart `file`（.mcpr ≤300MB），同上 |
| GET | `/me/matches/:id/evidence` | 我的提交状态 |

截止：比赛 `ended_at + 60 分钟`；逾期可交但标记 late。

## 申诉（玩家）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/matches/:id/appeals` | `{ type, content }`；赛果公布 48h 内 |
| GET | `/me/appeals` | 我的申诉 |
| GET | `/appeals/:id` | 详情（本人或管理员） |
| POST | `/appeals/:id/replies` | 追加说明（本人） |

## 管理后台（`/admin`，均需 level>=1，标 ★ 需 level>=2）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/overview` | 数据总览 + 存储统计 + 待办数量 |
| GET | `/admin/users?query&level&page` | 用户列表 |
| PATCH | `/admin/users/:id` | 改状态（禁用/启用），不可改等级 |
| GET | `/admin/seasons` / POST `/admin/seasons` ★ | 赛季管理 |
| PATCH | `/admin/seasons/:id` ★ | 更新（sealed 后仅允许有限字段） |
| POST | `/admin/seasons/:id/state` ★ | `{ state }` 状态流转；sealed 生成快照 |
| PUT | `/admin/seasons/:id/rules` ★ | 规则版本（写 season_rules） |
| GET/POST/PATCH/DELETE | `/admin/seasons/:id/fields` ★ | 自定义报名字段 |
| GET | `/admin/registrations?seasonId&state&page` | 报名管理 |
| POST | `/admin/registrations/:id/revoke` | 取消资格 |
| GET | `/admin/matches?state&seasonId&page` | 比赛管理 |
| GET | `/admin/matches/:id` | 完整详情（含原始数据、证据列表、校验值） |
| POST | `/admin/matches/:id/review` | `{ action: approve\|reject\|correct\|abnormal\|resolve\|void, reason, corrected? }` |
| GET | `/admin/matches/:id/evidence/:evidenceId/download` | 管理员下载原始文件（鉴权 + 审计） |
| GET | `/admin/points?seasonId&userId&page` | 积分流水 |
| POST | `/admin/points/adjust` ★ | `{ seasonId, userId, delta, reason }`（写审计） |
| GET | `/admin/leaderboard?seasonId` | 后台排行榜 |
| GET/PATCH | `/admin/rank-tiers` ★ | 段位配置增删改 |
| GET | `/admin/teams?page` | 战队列表 |
| POST | `/admin/teams/:id/transfer` ★ | 队长转让/强制治理 |
| GET | `/admin/appeals?state&page` / POST `/admin/appeals/:id/reply` / POST `/admin/appeals/:id/resolve` | 申诉处理 |
| GET/POST/PATCH/DELETE | `/admin/announcements` | 公告管理 |
| GET | `/admin/notifications/broadcast` ★ / POST 同路径 | 全站通知 |
| GET/PUT | `/admin/settings/smtp` ★ | SMTP 配置（密码加密存储，响应脱敏） |
| POST | `/admin/settings/smtp/test` ★ | 发测试邮件 |
| GET | `/admin/servers` ★ / POST `/admin/servers` ★ / POST `/admin/servers/:id/rotate` ★ / POST `/admin/servers/:id/revoke` ★ | 服务器密钥管理 |
| GET | `/admin/files?kind&page` | 文件列表 + 空间统计 |
| DELETE | `/admin/files/:id` ★ | 删除证据（仅异常比赛/赛季清理；写审计） |
| POST | `/admin/files/cleanup-replays` ★ | 清理已封存赛季的 .mcpr |
| GET | `/admin/audit?action&page` | 审计日志（只读，无删除） |

## 服务器上报（HMAC）

### 认证头
```
X-XBed-Server: s1
X-XBed-Timestamp: 1730000000          # 秒级 Unix 时间戳，±300s 有效
X-XBed-Nonce: <32 字节随机 hex>        # 5 分钟内不可重复
X-XBed-Signature: <hex>                # HMAC-SHA256
```

### 签名串（canonical string）
```
{METHOD}\n{PATH}\n{TIMESTAMP}\n{NONCE}\n{SHA256_HEX(body)}
```
`PATH` 为不含域名的路径（如 `/api/ingest/match`）。签名 = `HMAC-SHA256(secret, canonical)` 小写 hex。

### POST `/ingest/match`
请求体：
```json
{
  "schemaVersion": 1,
  "matchId": "3f2c8a1e-...-uuid",
  "arena": "castle",
  "arenaDisplay": "城堡争夺",
  "mode": "4v4v4v4",
  "startedAt": "2026-11-08T12:00:00.000Z",
  "endedAt": "2026-11-08T12:18:00.000Z",
  "endReason": "team_eliminated",
  "winnerTeam": "红队",
  "isDraw": false,
  "abnormal": false,
  "abnormalReason": null,
  "players": [
    { "uuid": "…", "gameId": "Steve", "team": "红队", "isWinner": true,
      "kills": 8, "finalKills": 2, "deaths": 3, "finalDeaths": 1,
      "bedsBroken": 1, "placement": 1 }
  ],
  "events": [
    { "type": "kill", "at": "…", "actor": "Steve", "target": "Alex", "team": "红队" }
  ]
}
```

响应：
```json
{ "ok": true, "matchId": 12, "state": "pending", "duplicate": false }
```
- 重复 `matchId`（同 server）：200 + `duplicate: true`，不重复写入
- 未知/未绑定的 gameId：写入 match_players 且 `user_id=null`
- 校验失败：400 `invalid_payload`；签名失败：401 `bad_signature`

### GET `/ingest/ping`
返回 `{ ok: true, server: "s1", time }`，用于插件联调。

## 错误码

| code | HTTP | 说明 |
|---|---|---|
| `unauthorized` | 401 | 未登录/会话过期 |
| `forbidden` | 403 | 权限不足 |
| `not_found` | 404 | 资源不存在 |
| `invalid_request` | 400 | 参数校验失败 |
| `email_unverified` | 403 | 邮箱未验证，禁止报名 |
| `registration_closed` | 403 | 报名未开放/已结束 |
| `deadline_passed` | 403 | 超过证据/申诉截止时间 |
| `bad_signature` / `stale_timestamp` / `nonce_reused` | 401 | 服务器上报认证失败 |
| `conflict` | 409 | 重复/状态冲突 |
| `rate_limited` | 429 | 频率限制 |
