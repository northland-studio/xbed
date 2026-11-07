# XBed S1 验收与测试记录

> 记录时间：2026-11-08
> 环境：HK 服务器 `64.90.13.2`（生产）/ XBed 起床战争服 `189.105.72.119`

## 1. 已完成并验证

### 1.1 仓库与 CI

| 仓库 | 状态 |
|---|---|
| `northland-studio/xbed`（网站 monorepo） | 公开，CI 通过（API 类型检查 + 75 项测试 + API/Web 构建） |
| `northland-studio/xbed-plugin`（Paper 插件） | 公开，CI 通过（Gradle 7.6.4 + Java 11 构建出 `XBedSync-1.0.0.jar`，产物 artifact 可下载） |

### 1.2 后端 API（本地实测）

```
pnpm test        → 9 个测试文件 / 75 项全部通过
tsc --noEmit     → 无类型错误
db:migrate       → 39 张表，journal_mode=wal
db:seed          → 幂等（赛季 S1、段位 14 条、服务器 s1、默认公告）
```

覆盖：OAuth state 校验/重放、非成员与 level=-1 拒绝、L0/L1/L2 权限、HMAC 签名/时间戳/nonce/幂等、审核结算与重复结算防护、排行榜排序、报名邮箱校验、上传限制、申诉 48h 期限、审计只读等。

### 1.3 生产部署（HK）

```
pm2 进程:     xbed-api（id 19，Node 20，独立目录 /var/www/xbed）
健康检查:     GET /api/health → {"ok":true,"db":"ok"}
公开接口:     /api/stats/overview、/api/seasons 返回真实 S1 赛季数据
数据库:       /var/www/xbed/data/xbed.db（WAL，39 表）
依赖版本:     better-sqlite3 11.10.0（Node 20 预编译，已在 HK 实测）
nginx:        xbed.xuanjian.top 站点已配置（当前仅 HTTP，待 DNS 后签证书）
```

### 1.4 服务器上报链路（生产实测）

用模拟插件（HMAC-SHA256 签名）对生产 API 实测：

```
POST /api/ingest/match        → 200 {"ok":true,"matchId":6,"state":"pending","seasonId":1}
重复 POST 同一 matchId        → 200 {"duplicate":true}   ← 幂等生效
赛季窗口外的比赛              → 200 {"state":"abnormal"} + abnormal_reason=no_season
```

### 1.5 插件部署（XBed 起床战争服）

```
路径:   /opt/xbed-bedwars/plugins/XBedSync.jar（CI 产物，66KB）
配置:   plugins/XBedSync/config.yml（apiBaseUrl=https://xbed.xuanjian.top，serverKey=s1，HMAC 密钥）
状态:   [XBedSync] Enabling XBedSync v1.0.0
        [XBedSync] 已启用。serverKey=s1 season=S1 queue=... pending=0 modeAllowlist=ALL
服务器: PaperSpigot 1.8.8 + BedWars1058 23.1.1，服务 active，25565 正常
```

## 2. 待完成（依赖 DNS）

### 2.1 阻塞项

`xbed.xuanjian.top` 尚无 DNS A 记录，导致：

- HTTPS 证书无法签发（OAuth 回调必须是 https）
- 插件无法访问 API（会进入本地队列并自动重试，不丢数据）
- 真实 OAuth 登录链路无法端到端验证

### 2.2 DNS 配置完成后要执行的验证

1. `certbot --nginx -d xbed.xuanjian.top` 签发证书并强制 HTTPS
2. 浏览器真实 OAuth 登录（level=1/2 账号）→ 同步资料 → 会话建立
3. `/xbedsync ping`（RCON）确认插件到 API 连通
4. 打一局真实起床战争 → 后台出现待审核比赛（含玩家统计与事件时间线）
5. 管理员审核通过 → 验证积分 ±5、排行榜、段位、通知
6. 玩家上传 `latest.log` / `.mcpr` → 证据工作台可见、可下载、有审计
7. 提交申诉（48h 内）→ 管理员处理 → 记录完整

## 3. 已知限制（诚实标注）

| 项 | 说明 |
|---|---|
| 真实 OAuth 全链路 | 本地仅用 MockOAuthClient + 真实端点探测（client_secret 有效、生产回调已登记）；完整授权码流程需 DNS+HTTPS 后验证 |
| SMTP 发信 | 未配置生产 SMTP_PASS，验证码当前打印日志；配置后即可真实发信 |
| `.mcpr` 大文件 | 流式上传 + SHA-256 已实现，未做 300MB 真实压测 |
| 插件个体淘汰顺序 | BedWars1058 23.1.1 只提供队伍级淘汰事件，`placement` 为队伍名次；已在不支持清单标注 |
| `isDraw` | 该版本无平局机制，恒为 false；无胜者时标记 abnormal |
| 移动端 | 断点与卡片化已实现，未做真机截图复核 |
| 回放清理 | 后台手动触发（赛季封存后），无定时任务 |

## 4. 验收对照（规格书第二十三部分）

| 验收项 | 状态 |
|---|---|
| 23.1 身份认证 | ⏳ 待 DNS 后真实验证（代码与单测完成） |
| 23.2 赛事（赛季/报名） | ✅ 赛季 S1 已建、报名接口与前端完成 |
| 23.3 服务器（插件采集/上报/重试/幂等） | ✅ 插件已装、上报幂等实测通过（真实比赛待 DNS） |
| 23.4 证据（日志/回放/截止/隔离） | ✅ 上传与鉴权下载实现，单测覆盖 |
| 23.5 审核 | ✅ 审核工作台与流程实现，单测覆盖 |
| 23.6 积分 | ✅ +5/−5/0、幂等结算、排行榜排序、段位计算（单测 75 项） |
| 23.7 申诉 | ✅ 48h 期限、处理记录（单测覆盖） |
| 23.8 生产部署 | 🔄 API 已上线、前端已部署；HTTPS 待 DNS |
