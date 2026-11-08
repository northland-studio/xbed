#!/bin/bash
cd /var/www/xbed/api || exit 1
/usr/bin/node --input-type=module -e "
import Database from 'better-sqlite3';
const db = new Database('/var/www/xbed/data/xbed.db');
const season = db.prepare('SELECT * FROM seasons WHERE id = 1').get();
const { seasonIsRegistrationOpen, seasonStateLabel } = await import('/var/www/xbed/api/dist/lib/season.js');
console.log('赛季:', season.code, '| state =', season.state, '(' + seasonStateLabel(season.state) + ')', '| registration_open =', season.registration_open);
console.log('start_at:', season.start_at, '| end_at:', season.end_at);
console.log('当前时间:', new Date().toISOString());
console.log('报名判定 seasonIsRegistrationOpen =', seasonIsRegistrationOpen(season));
db.close();
" 2>&1 | head -10
