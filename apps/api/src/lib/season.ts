import type { DB } from '../db/index.js';
import type { SeasonRow } from '../db/models.js';

export const PUBLISHED_SEASON_STATES = ['registration', 'running', 'sealed', 'archived'] as const;

export function getSeason(db: DB, seasonId: number): SeasonRow | null {
  const row = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId) as SeasonRow | undefined;
  return row ?? null;
}

export function getSeasonByCode(db: DB, code: string): SeasonRow | null {
  const row = db.prepare('SELECT * FROM seasons WHERE code = ?').get(code) as SeasonRow | undefined;
  return row ?? null;
}

/** 当前赛季：优先 running，其次 registration，取开始时间最新的一条 */
export function getCurrentSeason(db: DB): SeasonRow | null {
  const row = db
    .prepare(
      `SELECT * FROM seasons
       WHERE state IN ('running','registration')
       ORDER BY CASE state WHEN 'running' THEN 0 ELSE 1 END, COALESCE(start_at, created_at) DESC, id DESC
       LIMIT 1`,
    )
    .get() as SeasonRow | undefined;
  return row ?? null;
}

/** 赛季是否已封存（常规成绩不可修改） */
export function isSeasonSealed(season: SeasonRow | null | undefined): boolean {
  return season?.state === 'sealed' || season?.state === 'archived';
}

export function seasonIsRegistrationOpen(season: SeasonRow | null | undefined, now = Date.now()): boolean {
  if (!season) return false;
  if (season.state !== 'registration' && season.state !== 'running') return false;
  if (season.registration_open !== 1) return false;
  // 报名期本来就是「赛季开始前」的窗口，因此 registration 状态下不限制 start_at 之前
  // （start_at 是比赛/赛季正式开始时间，报名应在其之前开放）
  if (season.state === 'running' && season.start_at && Date.parse(season.start_at) > now) return false;
  if (season.end_at && Date.parse(season.end_at) < now) return false;
  return true;
}

/** 赛季状态的中文名称（用于提示文案） */
export function seasonStateLabel(state: string): string {
  const map: Record<string, string> = {
    draft: '草稿',
    registration: '报名中',
    running: '进行中',
    sealed: '已封存',
    archived: '已归档',
  };
  return map[state] ?? state;
}

export function listSeasons(db: DB, options: { includeDrafts?: boolean } = {}): SeasonRow[] {
  const where = options.includeDrafts
    ? ''
    : "WHERE state IN ('registration','running','sealed','archived')";
  return db
    .prepare(`SELECT * FROM seasons ${where} ORDER BY COALESCE(start_at, created_at) DESC, id DESC`)
    .all() as SeasonRow[];
}

export function countRegistrations(db: DB, seasonId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM registrations WHERE season_id = ? AND state = 'active'")
    .get(seasonId) as { c: number };
  return row.c;
}
