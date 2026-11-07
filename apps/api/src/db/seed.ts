import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getConfig } from '../config.js';
import { decryptString, encryptString, randomHex, sha256Hex } from '../lib/crypto.js';
import { migrateDatabase, openDatabase, type DB } from './index.js';

export interface SeedResult {
  seasonId: number;
  seasonCode: string;
  rankTierCount: number;
  serverKey: string;
  /** 仅在本次 seed 新建服务器时返回一次（明文密钥） */
  serverSecret?: string;
  created: {
    season: boolean;
    rankTiers: boolean;
    server: boolean;
    announcement: boolean;
  };
}

export interface SeedOptions {
  silent?: boolean;
}

const SEASON_SEED = {
  code: 'S1',
  name: 'XBed 玄剑起床战争挑战赛 S1',
  description:
    '玄剑公会起床战争竞技赛事 S1。通过玄剑 OAuth 登录、报名后参与服务器比赛，经管理员审核后结算积分、段位与排行榜。',
  initial_points: 60,
  min_points: 0,
  win_points: 5,
  loss_points: -5,
  draw_points: 0,
  reward_note: '赛季奖励由玄剑公会管理组决定，XBed 仅提供展示与发放记录能力。',
} as const;

/** 青铜/白银/黄金/铂金/钻石/大师/王者，以 60 为基线 */
const TIER_TEMPLATE: Array<{ name: string; min: number; color: string }> = [
  { name: '青铜', min: 0, color: '#a9744f' },
  { name: '白银', min: 30, color: '#b8c2cc' },
  { name: '黄金', min: 60, color: '#f0b429' },
  { name: '铂金', min: 90, color: '#3cc8b4' },
  { name: '钻石', min: 120, color: '#4a9eff' },
  { name: '大师', min: 160, color: '#b45cff' },
  { name: '王者', min: 200, color: '#ff4d6d' },
];

function insertRankTiers(
  db: DB,
  kind: 'season' | 'lifetime',
  seasonId: number | null,
): number {
  const condition =
    seasonId === null ? 'kind = ? AND season_id IS NULL' : 'kind = ? AND season_id = ?';
  const params: unknown[] = seasonId === null ? [kind] : [kind, seasonId];
  const existing = db
    .prepare(`SELECT COUNT(*) AS c FROM rank_tiers WHERE ${condition}`)
    .get(...params) as { c: number };
  if (existing.c > 0) return 0;

  const insert = db.prepare(
    `INSERT INTO rank_tiers (kind, season_id, name, min_points, color, icon, sort_order)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  );
  let sort = 10;
  for (const tier of TIER_TEMPLATE) {
    insert.run(kind, seasonId, tier.name, tier.min, tier.color, sort);
    sort += 10;
  }
  return TIER_TEMPLATE.length;
}

/**
 * 初始化/补齐默认数据（幂等，可重复执行）：
 * - 默认赛季 S1（初始积分 60，最低 0）
 * - 赛季段位 + 历史段位两套
 * - 默认服务器 s1（随机密钥，仅新建时返回一次明文）
 * - 默认公告一条
 */
export function seedDatabase(db: DB, config: { encryptionKey: string }, options: SeedOptions = {}): SeedResult {
  const log = options.silent ? () => undefined : (...args: unknown[]) => console.log(...args);
  const created = { season: false, rankTiers: false, server: false, announcement: false };

  const run = db.transaction((): SeedResult => {
    // 1) 赛季
    let season = db.prepare('SELECT id, code FROM seasons WHERE code = ?').get(SEASON_SEED.code) as
      | { id: number; code: string }
      | undefined;
    let seasonId: number;
    if (!season) {
      const now = new Date();
      const startAt = now.toISOString();
      const endAt = new Date(now.getTime() + 90 * 86_400_000).toISOString();
      const info = db
        .prepare(
          `INSERT INTO seasons
             (code, name, description, start_at, end_at, state, registration_open,
              initial_points, min_points, win_points, loss_points, draw_points, reward_note)
           VALUES (?, ?, ?, ?, ?, 'registration', 1, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          SEASON_SEED.code,
          SEASON_SEED.name,
          SEASON_SEED.description,
          startAt,
          endAt,
          SEASON_SEED.initial_points,
          SEASON_SEED.min_points,
          SEASON_SEED.win_points,
          SEASON_SEED.loss_points,
          SEASON_SEED.draw_points,
          SEASON_SEED.reward_note,
        );
      seasonId = Number(info.lastInsertRowid);
      created.season = true;
    } else {
      seasonId = season.id;
    }

    // 2) 段位（赛季 + 历史两套）
    const seasonTiers = insertRankTiers(db, 'season', seasonId);
    const lifetimeTiers = insertRankTiers(db, 'lifetime', null);
    if (seasonTiers + lifetimeTiers > 0) created.rankTiers = true;

    // 3) 服务器 s1（密钥仅创建时明文返回一次）
    let server = db.prepare('SELECT id, server_key FROM servers WHERE server_key = ?').get('s1') as
      | { id: number; server_key: string }
      | undefined;
    let serverSecret: string | undefined;
    if (!server) {
      serverSecret = randomHex(32);
      db.prepare(
        `INSERT INTO servers (server_key, name, secret_hash, secret_enc, state, note)
         VALUES (?, ?, ?, ?, 'active', ?)`,
      ).run(
        's1',
        'S1 比赛服',
        sha256Hex(serverSecret),
        encryptString(serverSecret, config.encryptionKey),
        '默认服务器，由 db:seed 自动创建',
      );
      created.server = true;
    }

    // 4) 默认公告
    const announcementCount = db.prepare('SELECT COUNT(*) AS c FROM announcements').get() as {
      c: number;
    };
    if (announcementCount.c === 0) {
      db.prepare(
        `INSERT INTO announcements (title, content, category, pinned, published)
         VALUES (?, ?, 'general', 1, 1)`,
      ).run(
        '欢迎来到 XBed S1',
        [
          'XBed 玄剑起床战争挑战赛 S1 现已开放报名。',
          '',
          '参赛流程：玄剑 OAuth 登录 → 绑定并验证邮箱 → 报名当前赛季 → 参与服务器比赛 → 赛后 1 小时内上传 latest.log 与 .mcpr 回放 → 管理员审核 → 积分与段位结算。',
          '',
          '请遵守赛事规则，所有原始证据与管理操作均会留档可追溯。',
        ].join('\n'),
      );
      created.announcement = true;
    }

    return {
      seasonId,
      seasonCode: SEASON_SEED.code,
      rankTierCount: (db.prepare('SELECT COUNT(*) AS c FROM rank_tiers').get() as { c: number }).c,
      serverKey: 's1',
      serverSecret,
      created,
    };
  });

  const result = run();
  log(
    `[seed] 赛季 ${result.seasonCode}(id=${result.seasonId})，段位 ${result.rankTierCount} 条，服务器 ${result.serverKey}`,
  );
  log(
    `[seed] 新建: 赛季=${result.created.season} 段位=${result.created.rankTiers} 服务器=${result.created.server} 公告=${result.created.announcement}`,
  );
  return result;
}

async function main(): Promise<void> {
  const config = getConfig();
  const db = openDatabase(config.dbFile);
  try {
    migrateDatabase(db);
    const result = seedDatabase(db, config);

    if (result.serverSecret) {
      console.log('');
      console.log('==================================================================');
      console.log('[seed] 已创建服务器 s1 的 HMAC 密钥（明文仅本次输出一次，请立即保存）：');
      console.log(`        X-XBed-Server: s1`);
      console.log(`        secret: ${result.serverSecret}`);
      console.log('        已加密保存到数据库，可在需要时用 `pnpm db:seed -- --print-secret` 重新取出。');
      console.log('==================================================================');
      console.log('');
    } else {
      console.log('[seed] 服务器 s1 已存在，未生成新密钥（如需轮换请使用管理后台 rotate 接口）。');
    }

    if (process.argv.includes('--print-secret')) {
      const row = db.prepare('SELECT server_key, secret_enc FROM servers WHERE server_key = ?').get('s1') as
        | { server_key: string; secret_enc: string | null }
        | undefined;
      if (row?.secret_enc) {
        console.log(`[seed] --print-secret ${row.server_key}: ${decryptString(row.secret_enc, config.encryptionKey)}`);
      } else {
        console.log('[seed] --print-secret: 未找到可解密的服务器密钥。');
      }
    }
  } finally {
    db.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error('[seed] 失败:', error);
    process.exitCode = 1;
  });
}
