# @xbed/api — XBed S1 后端

Express 4 + TypeScript + better-sqlite3（WAL），ESM，tsx 运行。实现 `docs/API.md` 契约与 `docs/XBed-需求规格书.md` 的 S1 业务闭环。

## 快速开始（本地）

```bash
# 仓库根目录
pnpm install
cd apps/api
cp .env.example .env    # 填写 SESSION_SECRET / ENCRYPTION_KEY / OAuth / SMTP
pnpm db:migrate
pnpm db:seed            # 输出服务器 s1 的 HMAC 密钥（仅首次创建时打印一次）
pnpm dev                # http://127.0.0.1:3939
pnpm test               # vitest + supertest（内存 SQLite，不依赖外部服务）
npx tsc -p tsconfig.json --noEmit
```

未配置玄剑 OAuth 时（`NODE_ENV=development` 且 `OAUTH_MOCK=1`），可用开发用模拟登录联调：

```
GET /api/auth/mock-login?userId=dev-l2&level=2&nickname=DevAdmin&format=json
```

生产环境（`NODE_ENV=production`）会强制要求 `SESSION_SECRET` 与 `ENCRYPTION_KEY` 均 ≥32 字符。

## 环境变量

见 `.env.example`。关键项：

| 变量 | 说明 |
|---|---|
| `PORT` / `HOST` | 默认 3939 / 127.0.0.1（仅本机，由 nginx 反代） |
| `PUBLIC_ORIGIN` | 前端站点 Origin，用于写操作 Origin 校验与 Cookie Secure 判断 |
| `EXTRA_ORIGINS` | 额外允许的 Origin（逗号分隔，开发默认放行 5173） |
| `DB_FILE` / `FILES_DIR` | 数据库与私有文件目录，生产按 ARCH.md 指向 `/var/www/xbed/data` |
| `SESSION_SECRET` | 会话/验证码 HMAC 盐 |
| `ENCRYPTION_KEY` | OAuth token、SMTP 密码、服务器密钥的 AES-256-GCM 主密钥（64 hex 最佳） |
| `XUANJIAN_*` | 玄剑 OAuth 2.0 机密客户端配置（provider / client_id / client_secret / redirect_uri / scope） |
| `SMTP_*` | 备用 SMTP 配置；管理后台 `/admin/settings/smtp` 配置优先 |
| `OAUTH_MOCK` | 仅开发环境启用 mock-login，生产强制忽略 |
| `UPLOAD_MAX_LOG_MB` / `UPLOAD_MAX_MCPR_MB` | 证据大小上限（可被 system_settings 覆盖，但上传中间件按启动配置） |
| `EVIDENCE_DEADLINE_MINUTES` / `APPEAL_DEADLINE_HOURS` | 默认 60 / 48，可被 system_settings 覆盖 |

## 目录结构

```
src/
├── index.ts            启动（listen、定时清理、优雅退出）
├── app.ts              createApp()：中间件顺序、路由挂载
├── config.ts           环境变量 + .env 解析
├── db/                 连接/迁移/schema 执行/seed/行类型
├── lib/                crypto、session、audit、mailer、oauth、upload/storage、
│                       settlement（审核+结算事务）、leaderboard（统计/段位/排行）、
│                       settings、notifications、serialize、time、errors、pagination
├── middleware/         auth（level 校验）、origin（CSRF）、rateLimit、error（统一响应）
└── routes/             auth、public、me、registrations、evidence、appeals、teams、
                        ingest（HMAC）、admin/*（seasons/matches/content/system）
db/schema.sql           数据库结构（含 oauth_states、appeal_attachments 两处补充表）
tests/                  vitest + supertest 集成测试（内存库）
```

## 与 `docs/API.md` 的差异/补充清单

已实现 API.md 全部接口，并补充以下接口（不删改原接口）：

- `GET/PUT /api/admin/settings`（★L2）：system_settings 键值；敏感键返回 `***`，PUT 回传 `***` 表示不改。
- `DELETE /api/admin/rank-tiers/:id`（★L2）：单条删除段位配置（历史 `rank_history` 保留）。
- `GET /api/admin/rank-tiers` 支持 `?kind=&seasonId=`；`PATCH /api/admin/rank-tiers` 为单条 upsert。
- `PATCH|DELETE /api/admin/seasons/:id/fields/:fieldId`（同时兼容 API.md 的 collection 写法：body 带 `id`）。
- `GET /api/me/teams`：我的战队 + 待处理邀请（前端需要）。
- `POST /api/appeals/:id/attachments`（multipart `file`，≤20MB，.log/.txt/.png/.jpg/.jpeg/.zip/.mcpr）
  与 `GET /api/appeals/:id/attachments/:attachmentId/download`（本人/管理员，写审计）；`GET /api/appeals/:id` 返回 `attachments`。
- `GET /api/me/matches/:matchId/evidence/:evidenceId/download`：玩家下载本人证据（规格 12.4 要求本人可下载；API.md 只列了管理员下载）。
- `POST /api/admin/matches/:id/season`（L1）：为 `no_season` 异常比赛指定所属赛季后再结算。
- `GET /api/admin/matches/:id/events`、`GET /api/admin/matches/:id/brief`：后台辅助读取。
- `GET /api/auth/mock-login`：仅开发环境（`OAUTH_MOCK=1` 且非 production）可用。
- `GET /api/health` 额外响应 `version/time`。
- 公开 `GET /api/matches` 的 `state` 过滤被忽略（公开只返回 `approved/resolved`，防止越权看未审核数据）。
- `GET /api/matches/:id` 仅返回 `approved/resolved`；未审核比赛对普通用户 404。

服务端上报（HMAC）按 API.md 实现：canonical = `METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256_HEX(body)`，
±300s 时间窗、nonce 5 分钟唯一（`server_nonces`）、幂等 `UNIQUE(server_id, external_match_id)`、
原始数据仅 INSERT、每次上报写 `server_submissions`，签名失败写审计。
赛季归属：按 `match.startedAt` 匹配 `state='running'` 且落在 `[start_at, end_at]` 的赛季；
匹配不到则 `season_id=NULL` 且 `abnormal/no_season`（管理员可经 `/admin/matches/:id/season` 指定）。

## 测试

`pnpm test` 共 75 个集成用例（9 个文件，内存 SQLite + supertest），覆盖：

- OAuth：state 一次性/过期、重放、非成员、level=-1、禁用账号、等级会话快照、登出
- 权限：L0/L1/L2、★ 接口、Origin 校验、审计仅 L2、设置脱敏
- 服务器上报：签名错误、时间戳过期、nonce 重放、重复上报幂等、无效 payload、未绑定玩家、abnormal/no_season、吊销密钥
- 审核结算：approve 事务（赛果/积分/统计/段位/通知/审计）、重复审核不重复结算、平局、驳回、correct 版本与前后数据、void 冲正、封存禁改、无赛季拒结算+指定赛季
- 排行榜：积分→胜率→击杀排序、并列、0 场过滤、后台一致、玩家档案/历史
- 报名：邮箱验证、重复报名、自定义字段必填/选项校验、报名关闭、退出限制、game_id 修改限制
- 邮箱验证码：发送/冷却 60s/1h 上限 8 次/错误次数/过期/绑定
- 证据上传：流式 SHA-256、落盘路径、逾期标记、扩展名白名单、大小限制、非参赛拒绝、本人下载+审计、路径穿越防护
- 申诉：48h 期限、非参赛拒绝、未公布拒绝、回复/裁决/审计/通知、附件上传下载与白名单

## 已知限制 / 未在生产验证的部分

1. **真实玄剑 OAuth 未做端到端联调**：测试使用注入的 MockOAuthClient 覆盖流程与异常分支；`lib/oauth.ts` 对 `/verify`、`/userinfo`、`/member` 返回结构做了兼容解析，真实的字段以官网最新实现为准，上线前需用真实 client_secret 做一次联调。
2. **Refresh Token 轮换**：已实现 `refreshStoredToken()`（一次性 refresh 轮换、加密覆盖存储），但当前 S1 业务流程不依赖后续 access_token 调用，因此未挂定时任务；属于“按需可调用”，非自动定时刷新。
3. **SMTP 未真实发信**：默认环境未配置可用 SMTP，验证码走“打印日志 + 记录 email_logs failed”分支（不抛错）；真实 SMTP 发信需配置后在后台点测试邮件验证。
4. **战队最低人数**：`team_min_members` 仅存储展示，未强制（S1 队长邀请制，最低人数无法在创建瞬间满足）；最高人数在邀请接受时强制。队长退出需 L2 转让队长或归档战队。
5. **`.mcpr` 清理**：仅提供管理后台手动触发 `POST /admin/files/cleanup-replays`（要求赛季 sealed/archived），未接定时任务。
6. **限流为单进程内存实现**：适合单机 pm2 单实例；多实例需换共享存储。
7. **大文件压力**：`.mcpr` 300MB 上限走流式（不占内存），但未做 300MB 级压力测试；测试以缩小上限验证超限清理逻辑。
8. **段位展示为实时计算**：`rank_history` 保存变化时的段位快照，但个人档案的当前段位按当前 `rank_tiers` 实时计算；段位配置修改会影响未封存赛季的展示（历史快照仍保留）。
9. **better-sqlite3 版本**：为兼容本机 Electron 44 运行时的 N-API 预编译，依赖升级到 `^13.0.3`（要求 Node ≥22；官方预编译二进制无需本地编译）。生产部署 Node 版本需 ≥22。
