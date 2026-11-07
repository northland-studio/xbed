#!/bin/bash
DB=/var/www/xbed/data/xbed.db
echo "=== 清理模拟测试比赛（TestPlayer*）==="
sqlite3 "$DB" "DELETE FROM matches WHERE id IN (SELECT DISTINCT match_id FROM match_players WHERE game_id LIKE 'TestPlayer%' OR game_id IN ('TestC','TestD'));"
echo "  剩余比赛数: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM matches;')"
echo "  剩余比赛玩家数: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM match_players;')"
echo
echo "=== 当前赛季状态 ==="
sqlite3 -header -column "$DB" "SELECT id,code,state,registration_open,start_at,end_at FROM seasons;"
echo
echo "=== 用户/会话 ==="
sqlite3 -header -column "$DB" "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM sessions) AS sessions;"
