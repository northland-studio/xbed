# XBed · 玄剑起床战争挑战赛 S1

玄剑公会起床战争赛事与竞技档案平台。

- 需求规格：`docs/XBed-需求规格书.md`
- 技术架构：`docs/ARCH.md`
- API 契约：`docs/API.md`
- 部署运维：`docs/DEPLOY.md`

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite（better-sqlite3，WAL） |
| 身份认证 | 玄剑 OAuth 2.0（机密客户端，Authorization Code） |
| 服务器插件 | Paper 1.8.8 + BedWars1058 事件采集（独立仓库） |

## 目录结构

```
apps/api      Express API（OAuth、赛事、审核、积分、文件、上报）
apps/web      React 前端（公开站 + 管理后台）
packages/shared  共享类型
docs/         规格、架构、API、部署文档
deploy/       nginx / pm2 / 备份脚本
```

## 本地开发

```bash
pnpm install
cp apps/api/.env.example apps/api/.env    # 填入配置
pnpm --filter @xbed/api db:migrate
pnpm --filter @xbed/api db:seed
pnpm dev:api        # http://127.0.0.1:3939
pnpm dev:web        # http://127.0.0.1:5173 （代理 /api → 3939）
```

## 生产部署（HK 64.90.13.2）

见 `docs/DEPLOY.md`：独立 pm2 进程 `xbed-api`、独立 SQLite、独立文件目录、nginx 子域 `xbed.xuanjian.top`、HTTPS。

## 核心业务链路

```
BedWars1058 事件 → 服务器插件聚合单场 → HMAC 上报
→ 原始数据入库（不可覆盖）→ 管理员审核（证据交叉核验）
→ 正式赛果 → 积分结算（事务 + 幂等）→ 排行榜/段位/个人档案
→ 申诉（48h）→ 赛季封存 → 回放清理（保留赛果与日志）
```

## 规则要点

- 仅玄剑公会成员可登录（OAuth `is_member=true`），`level=-1` 拒绝
- 胜负积分：+5 / −5 / 0；赛季初始 60 分，下限 0
- 原始服务器数据、玩家 `latest.log`、`.mcpr` 均不可覆盖
- 未经审核的赛果不进入正式统计
- 积分结算幂等，重复上报/重复审核不会重复计分
- 管理员权限继承玄剑等级（L1 管理 / L2 超管），后端强制校验
- 审计日志只增不删

## License

内部项目 · 北域工作室 Northland Studio
