# XBed S1 验收与测试记录

> 更新时间：2026-11-08
> 生产地址：https://xbed.xuanjian.top
> 环境：HK `64.90.13.2`（网站/API）/ S1 比赛服 `189.105.72.119` / 115 服 `115.190.153.44`

## 1. 线上状态

| 项 | 状态 |
|---|---|
| 网站 | https://xbed.xuanjian.top 200（Cloudflare → HK 源站） |
| API | `GET /api/health` → `{"ok":true,"db":"ok"}` |
| 源站 TLS | Let's Encrypt 证书已签发（到期 2027-02-05，certbot 自动续期） |
| 进程 | pm2 `xbed-api`（Node 20，独立目录 /var/www/xbed，独立 SQLite） |
| 数据库 | 40 表 WAL，赛季 S1、14 条段位、服务器 s1/s2 密钥、默认公告 |
| 赛季状态 | **S1 = registration（报名中）**，报名窗口 2026-11-24 ~ 2027-01-07 |
| S1 比赛服（189） | 已重置为原始 zip 初始态 + **仅** XBedSync 1.0.1（serverKey=s1），25 张竞技场加载正常 |
| 115 服（115） | 保持原有配置不变 + **仅** 新增 XBedSync 1.0.1（serverKey=s2），25 张竞技场加载正常 |
| 上报链路 | `GET /api/ingest/ping` 对 s1 / s2 均返回 `{"ok":true}` |

## 2. 关键链路实测证据

### 2.1 玄剑 OAuth 真实登录（已在生产发生）

```
users:    id=1  xuanjian_user_id=2  username=morzane  level=2  email_verified=1
sessions: 3 条（真实浏览器登录产生）
audit:    season.update ×3、settings.smtp ×1（操作者 user 1）
```

说明：OAuth 授权码 → token → verify → 成员校验 → 建会话 → 资料同步 → 管理后台操作，全链路在生产跑通。

### 2.2 服务器上报链路（生产实测，含幂等）

```
POST /api/ingest/match（HMAC-SHA256）
  → 200 {"ok":true,"matchId":N,"state":"pending","seasonId":1}
重复上报同一 matchId
  → 200 {"ok":true,"duplicate":true}        ← 幂等，不重复建单
赛季窗口外上报
  → 200 {"state":"abnormal","abnormal_reason":"no_season"}  ← 异常标记
```

模拟测试数据已在验证后清理（matches / match_players / match_events / server_submissions 均为 0）。

### 2.3 插件到 API 连通（真实插件 → Cloudflare → HK）

```
插件版本: XBedSync 1.0.1（GitHub Actions 构建产物）
配置:     apiBaseUrl=https://xbed.xuanjian.top/api  serverKey=s1  HMAC 密钥已配置
RCON:     xbedsync ping → 请求 https://xbed.xuanjian.top/api/ingest/ping
源站日志: GET /api/ingest/ping 200 59 "-" "XBedSync/1.0.1"
```

### 2.4 联调中发现并修复的真实问题

| 问题 | 影响 | 修复 |
|---|---|---|
| 插件 `apiBaseUrl` 未含 `/api` | 请求打到 `/ingest/ping` → 被 nginx SPA 回退返回 HTML 200 | 配置改为 `https://xbed.xuanjian.top/api` |
| 插件只要 2xx 就判定上报成功 | 若被反代/SPA 返回 HTML 200，会**删除队列并丢数据** | 1.0.1 起要求响应 `Content-Type: json` 且 body 含 `"ok":true`，否则保留队列重试 |
| HK 既有 Node 20 与 better-sqlite3 13 不兼容（段错误） | API 无法启动 | 生产固定 Node 20 + better-sqlite3 11.10.0（已在仓库 engines 声明） |
| 插件队列路径相对目录嵌套错误 | 队列写入 `plugins/XBedSync/plugins/...` | 改为绝对路径 |
| 种子赛季状态为 registration，比赛无法归属赛季 | 上报全部 no_season | 赛季改为 running 验证后，按需求回到 registration（开赛后改 running） |

## 3. 代码与 CI

| 仓库 | 内容 | CI |
|---|---|---|
| [xbed](https://github.com/northland-studio/xbed) | 网站 monorepo（API/Web/deploy/docs） | ✅ 通过（类型检查 + 75 测试 + 构建） |
| [xbed-plugin](https://github.com/northland-studio/xbed-plugin) | XBedSync Paper 插件 | ✅ 通过（Gradle 构建 1.0.1 jar） |

后端测试：**9 个文件 / 75 项全绿**，覆盖 OAuth state、权限矩阵、上报安全（签名/时间戳/nonce/幂等）、审核结算与重复结算防护、排行榜排序、上传限制、申诉期限、审计只读等。

## 4. 尚待完成

| 项 | 说明 |
|---|---|
| Cloudflare SSL 模式 | 当前 CF → 源站走 80（Flexible）。建议在 CF 面板把 SSL/TLS 改为 **Full (strict)**，源站证书已就绪；改完可把 80 改回 301 跳转（配置在 `deploy/nginx-xbed-live.conf`） |
| 真实比赛闭环 | 需在服务器打一局真实起床战争 → 后台审核 → 积分/排行榜/段位/通知；插件已就绪，等待真实对局 |
| SMTP 发信 | 未配置生产 SMTP_PASS（验证码暂打印日志）；填入后即可真实发信 |
| `.mcpr` 300MB 压测 | 流式上传 + SHA-256 已实现，未做真实大文件压测 |
| 移动端真机 | 断点与卡片化已实现，建议手机复核 |

## 5. 验收对照（规格书第二十三部分）

| 验收项 | 结论 |
|---|---|
| 23.1 身份认证 | ✅ 生产真实 OAuth 登录成功（level=2 账号，审计可查） |
| 23.2 赛事（赛季/报名） | ✅ 赛季 S1 报名中，报名接口与前端就绪 |
| 23.3 服务器（采集/上报/重试/幂等） | ✅ 插件已装、ping 通、上报幂等实测；真实比赛待打 |
| 23.4 证据（日志/回放/截止/隔离） | ✅ 实现 + 单测覆盖 |
| 23.5 审核 | ✅ 工作台与流程实现 + 单测覆盖 |
| 23.6 积分 | ✅ +5/−5/0、幂等、排行榜、段位（单测覆盖） |
| 23.7 申诉 | ✅ 48h 期限与处理记录（单测覆盖） |
| 23.8 生产部署 | ✅ 域名、HTTPS、独立进程/数据库/目录、备份脚本、运维文档 |
