import type { DB } from '../db/index.js';
import type { RankTierRow } from '../db/models.js';

/** 按积分区间取赛季段位（同赛季优先，其次 season_id IS NULL 的全局配置） */
export function getSeasonTier(db: DB, seasonId: number, points: number): RankTierRow | null {
  const rows = db
    .prepare(
      `SELECT * FROM rank_tiers
       WHERE kind = 'season' AND (season_id = ? OR season_id IS NULL) AND min_points <= ?
       ORDER BY CASE WHEN season_id = ? THEN 0 ELSE 1 END, min_points DESC
       LIMIT 1`,
    )
    .all(seasonId, points, seasonId) as RankTierRow[];
  return rows[0] ?? null;
}

/** 历史（lifetime）段位 */
export function getLifetimeTier(db: DB, points: number): RankTierRow | null {
  const row = db
    .prepare(
      `SELECT * FROM rank_tiers
       WHERE kind = 'lifetime' AND season_id IS NULL AND min_points <= ?
       ORDER BY min_points DESC LIMIT 1`,
    )
    .get(points) as RankTierRow | undefined;
  return row ?? null;
}

export function listRankTiers(db: DB, options: { kind?: string; seasonId?: number | null } = {}): RankTierRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.kind) {
    conditions.push('kind = ?');
    params.push(options.kind);
  }
  if (options.seasonId !== undefined && options.seasonId !== null) {
    conditions.push('(season_id = ? OR season_id IS NULL)');
    params.push(options.seasonId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM rank_tiers ${where} ORDER BY kind, sort_order, min_points`)
    .all(...params) as RankTierRow[];
}
