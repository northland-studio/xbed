#!/bin/bash
DB=/var/www/xuanjian-guild/data/guild.db
sqlite3 -header -column "$DB" "
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN COALESCE(TRIM(game_id),'') <> '' AND COALESCE(is_frozen,0)=0 AND level >= 0 THEN 1 ELSE 0 END) AS is_member_true,
  SUM(CASE WHEN COALESCE(TRIM(game_id),'') = '' THEN 1 ELSE 0 END) AS no_game_id,
  SUM(CASE WHEN COALESCE(is_frozen,0) <> 0 THEN 1 ELSE 0 END) AS frozen,
  SUM(CASE WHEN level < 0 THEN 1 ELSE 0 END) AS negative_level
FROM users;"
echo
echo "=== 绑定游戏ID且有等级的样例 ==="
sqlite3 -header -column "$DB" "SELECT id, username, nickname, level, game_id, is_frozen FROM users WHERE COALESCE(TRIM(game_id),'')<>'' LIMIT 8;"
