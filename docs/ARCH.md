# XBed S1 技术架构

## 仓库结构（monorepo）
```
xbed/
├── apps/api          Express + TypeScript + better-sqlite3
├── apps/web          React 18 + TypeScript + Vite
├── packages/shared   前后端共享类型
├── docs/             规格书、API 契约、部署/运维文档
├── deploy/           nginx、pm2、备份脚本
└── .github/workflows CI
```

## 关键选型
| 层 | 选择 | 理由 |
|---|---|---|
| 后端 | Express 4 + TypeScript（tsx 运行/编译） | 规格固定 Express；TS 保证契约 |
| 数据库 | better-sqlite3（WAL） | 同步 API 简化事务；单机低并发够用 |
| 校验 | zod | 请求体集中校验 |
| 会话 | 服务端 sessions 表 + HttpOnly Cookie | 可即时吊销，避免前端持有 JWT |
| 密码学 | Node crypto：AES-256-GCM 加密 token/密钥，HMAC-SHA256 签名 | 无额外依赖 |
| 上传 | multer 流式 + 自算 SHA-256 | 避免大文件阻塞 |
| 邮件 | nodemailer | SMTP 可配置 |
| 前端 | React + Vite + react-router + TanStack Query + Recharts | 数据页/图表 |
| 样式 | 原生 CSS（变量 + BEM 风格工具类） | 无 UI 库依赖，控制视觉精度 |
| 测试 | vitest + supertest | 覆盖核心业务与安全 |

## 认证与会话
- 登录仅走玄剑 OAuth（机密客户端 + client_secret）。
- 登录成功时把 `level` 快照写入 `sessions.level_snapshot`；会话内不刷新等级。
- 会话有效期 7 天；服务端可吊销。
- CSRF：SameSite=Lax + 写操作校验 `Origin`；不用双提交。

## 权限
- `level>=1` 管理后台；`level>=2` 超管专属（★ 接口）。
- 后端中间件强制校验；前端仅隐藏入口。

## 比赛数据链路
```
BedWars1058 事件 → 插件聚合单场 → 本地队列(JSON) → HMAC POST /api/ingest/match
→ 写入 matches(pending) + match_raw_data + match_players + match_events
→ 管理员审核 → 生成 match_results → 事务内结算积分/统计/段位/排行榜 → 通知
```
- 幂等：`UNIQUE(server_id, external_match_id)`；重复上报返回 `duplicate:true`。
- 积分幂等：`point_transactions UNIQUE(season_id,user_id,match_id,reason)`。
- 原始数据表与正式赛果表分离，原始数据不可 UPDATE/DELETE（应用层禁止）。

## 积分与段位
- 胜负：+5 / −5 / 0（赛季可配但默认固定）。
- 赛季积分从 `initial_points`（默认 60）起算，`min_points` 下限 0。
- 赛季段位：由 `rank_tiers(kind='season')` 区间决定，默认以 60 为基线：
  青铜 0–29 / 白银 30–59 / 黄金 60–89 / 铂金 90–119 / 钻石 120–159 / 大师 160–199 / 王者 200+
- 历史段位：`kind='lifetime'`，按 `lifetime_statistics.total_points` 计算。

## 文件存储
```
/var/www/xbed/data/
├── xbed.db
└── files/
    ├── logs/<matchId>/<random>.log
    └── replays/<matchId>/<random>.mcpr
```
- 文件名随机；扩展名白名单；大小上限（log 20MB / mcpr 300MB）。
- 下载必须走 API 鉴权（管理员或本人），并写审计。
- 赛季封存后由 `cleanup-replays` 清理。

## 部署（HK 64.90.13.2）
- pm2 进程 `xbed-api`（端口 3939，仅 127.0.0.1），nginx `xbed.xuanjian.top` 反代 + 静态 `apps/web/dist`。
- 数据目录 `/var/www/xbed/data`，日志 `/var/www/xbed/logs`，`pm2-logrotate` 或 logrotate。
- 与官网（`xuanjian-guild`）完全隔离：独立 pm2、独立 DB、独立目录、独立 env。
- 备份：每日 `sqlite3 .backup` + `files/` 清单校验，保留 7/30 天。

## 环境变量（apps/api/.env）
```
NODE_ENV=production
PORT=3939
PUBLIC_ORIGIN=https://xbed.xuanjian.top
DB_FILE=/var/www/xbed/data/xbed.db
FILES_DIR=/var/www/xbed/data/files
SESSION_SECRET=<64 hex>
ENCRYPTION_KEY=<64 hex>
XUANJIAN_PROVIDER_URL=https://www.xuanjian.top
XUANJIAN_CLIENT_ID=xbed
XUANJIAN_CLIENT_SECRET=<注册时获得>
XUANJIAN_REDIRECT_URI=https://xbed.xuanjian.top/api/auth/callback
XUANJIAN_SCOPE=read:user read:member
SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM_NAME
```
