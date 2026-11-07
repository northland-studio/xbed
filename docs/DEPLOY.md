# XBed 部署与运维手册

目标：`https://xbed.xuanjian.top`，与玄剑官网（`xuanjian.top`）共用同一台 HK 服务器（`64.90.13.2`），**独立应用、独立数据库、独立目录、独立 pm2 进程**。

## 1. 服务器目录规划

```
/var/www/xbed/
├── api/                后端（dist + node_modules + .env + db/）
├── web/                前端静态产物（Vite dist）
├── data/
│   ├── xbed.db         SQLite（WAL）
│   └── files/          证据文件（logs/ replays/）
├── logs/               api-out.log / api-error.log / nginx-*.log / backup.log
├── backup/             db/ + manifest/
└── ecosystem.config.cjs
```

**不得写入** `/var/www/xuanjian-guild`（官网目录），也不得复用官网 pm2 进程或数据库。

## 2. 首次部署步骤

### 2.1 DNS
在 Cloudflare 添加：
```
A  xbed  →  64.90.13.2   (仅 DNS / 橙云可开可关，建议先灰云签发证书)
```

### 2.2 目录与用户
```bash
ssh hk
mkdir -p /var/www/xbed/{api,web,data/files,logs,backup}
chmod 700 /var/www/xbed/data
```

### 2.3 后端 .env（600 权限）
```bash
cp /var/www/xbed/api/.env.example /var/www/xbed/api/.env   # 或手动写
chmod 600 /var/www/xbed/api/.env
```
关键变量见 `apps/api/.env.example`，生产值：
```
NODE_ENV=production
PORT=3939
PUBLIC_ORIGIN=https://xbed.xuanjian.top
DB_FILE=/var/www/xbed/data/xbed.db
FILES_DIR=/var/www/xbed/data/files
XUANJIAN_CLIENT_ID=xbed
XUANJIAN_CLIENT_SECRET=<玄剑后台注册时返回>
XUANJIAN_REDIRECT_URI=https://xbed.xuanjian.top/api/auth/callback
```

### 2.4 首次部署
本地执行：
```bash
cd H:\chengxuyuanma\xbed-website
pnpm --filter @xbed/api build
pnpm --filter @xbed/web build
bash deploy/deploy-to-hk.sh
```
脚本会：上传 dist → 装生产依赖 → 迁移+seed → 上传前端 → pm2 启动 → nginx 配置 → reload → 健康检查。

### 2.5 HTTPS
```bash
ssh hk
certbot --nginx -d xbed.xuanjian.top --non-interactive --agree-tos -m norzane_work@foxmail.com
```
（或复用现有 Cloudflare DNS-01 脚本 `/var/www/xuanjian-guild/scripts/rag/issue-cert.sh`）

### 2.6 验证
```bash
curl -s https://xbed.xuanjian.top/api/health
curl -sI https://xbed.xuanjian.top/ | head -3
```

## 3. 日常更新

```bash
cd H:\chengxuyuanma\xbed-website
git pull
pnpm install
pnpm --filter @xbed/api build && pnpm --filter @xbed/web build
bash deploy/deploy-to-hk.sh
```

## 4. 备份与恢复

### 备份
```bash
chmod +x /var/www/xbed/backup.sh
crontab -e
30 4 * * * /var/www/xbed/backup.sh >> /var/www/xbed/logs/backup.log 2>&1
```
产物：`/var/www/xbed/backup/db/xbed-<ts>.db`（带 `integrity_check` 结果）+ `manifest/files-<ts>.tsv`。

### 恢复
```bash
pm2 stop xbed-api
cp /var/www/xbed/backup/db/xbed-<ts>.db /var/www/xbed/data/xbed.db
# 清掉 WAL/SHM
rm -f /var/www/xbed/data/xbed.db-wal /var/www/xbed/data/xbed.db-shm
pm2 start xbed-api
curl -s http://127.0.0.1:3939/api/health
```
文件恢复：按 `manifest/files-*.tsv` 对比缺失项（文件本身需另做磁盘级快照/异地备份）。

## 5. 日志与排障

```bash
pm2 logs xbed-api --lines 100
tail -f /var/www/xbed/logs/nginx-error.log
sqlite3 /var/www/xbed/data/xbed.db "PRAGMA journal_mode; PRAGMA integrity_check;"
```

常见问题：

| 现象 | 排查 |
|---|---|
| 502 | `pm2 status`，`tail logs/api-error.log`，端口 3939 是否监听 |
| OAuth 回调 failed | `XUANJIAN_REDIRECT_URI` 与玄剑后台登记是否**全等**；state 是否过期（5 分钟） |
| 上传 413 | nginx `client_max_body_size 320m` 是否生效（reload） |
| 上报 401 | 插件与后台服务器密钥不一致；时间戳偏差 >300s；nonce 重放 |
| 数据库锁 | 确认 WAL 生效、无长事务；不要用其他工具长时间占用 |

## 6. 安全清单

- [ ] `.env` 权限 600，不提交 Git
- [ ] `/var/www/xbed/data` 权限 700，文件不可通过 nginx 直接访问
- [ ] 上传目录不在 web root 下
- [ ] 证据下载走 API 鉴权 + 审计
- [ ] 服务器密钥（HMAC）不入库明文（SHA-256 存储）
- [ ] 审计表只有 INSERT，无删除接口
- [ ] 管理接口后端强制校验 level
- [ ] 定期轮换服务器密钥与 OAuth client_secret

## 7. 资源占用（实测基线）

| 项 | 值 |
|---|---|
| API 内存 | ~120–250MB（`--max-old-space-size=320`） |
| SQLite | 单文件，WAL，随比赛/证据增长 |
| 磁盘 | 证据文件最大头（.mcpr 300MB/场/人），赛季结束清理 |
| CPU | 空闲 <1%，审核/结算瞬时峰值 |

> HK 机器共 2GB 内存，已运行 17 个 pm2 应用，XBed 必须限制内存并在部署后观察 `free -m` 与 `pm2 monit`。
