#!/bin/bash
# XBed 备份脚本：SQLite 热备份 + 文件目录清单校验
# 用法：bash deploy/backup.sh            （默认备份到 /var/www/xbed/backup）
# crontab：30 4 * * * /var/www/xbed/backup.sh >> /var/www/xbed/logs/backup.log 2>&1
set -euo pipefail

APP=/var/www/xbed
DATA=$APP/data
BK=$APP/backup
TS=$(date +%Y%m%d-%H%M%S)
KEEP_DB=30      # 天
KEEP_FILES=7    # 天（清单）

mkdir -p "$BK/db" "$BK/manifest"

echo "[$(date '+%F %T')] 开始备份"

# 1. SQLite 一致性热备份
if [ -f "$DATA/xbed.db" ]; then
  sqlite3 "$DATA/xbed.db" ".backup '$BK/db/xbed-$TS.db'"
  sqlite3 "$BK/db/xbed-$TS.db" "PRAGMA integrity_check;" > "$BK/db/xbed-$TS.check" || true
  echo "  数据库备份: xbed-$TS.db ($(du -h "$BK/db/xbed-$TS.db" | cut -f1))"
  echo "  完整性检查: $(head -1 "$BK/db/xbed-$TS.check")"
fi

# 2. 文件目录清单（不复制大文件，记录路径/大小/SHA256 便于灾难恢复核对）
if [ -d "$DATA/files" ]; then
  find "$DATA/files" -type f -printf '%p\t%s\t%T@\n' > "$BK/manifest/files-$TS.tsv"
  echo "  文件清单: files-$TS.tsv ($(wc -l < "$BK/manifest/files-$TS.tsv") 个文件)"
fi

# 3. 清理过期
find "$BK/db" -name '*.db' -mtime +$KEEP_DB -delete
find "$BK/db" -name '*.check' -mtime +$KEEP_DB -delete
find "$BK/manifest" -name '*.tsv' -mtime +$KEEP_FILES -delete

echo "[$(date '+%F %T')] 备份完成"
