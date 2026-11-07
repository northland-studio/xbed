import type { DB } from '../db/index.js';
import type {
  LifetimeStatisticsRow,
  PlayerStatisticsRow,
  RankTierRow,
  SeasonRow,
} from '../db/models.js';
import type { Pagination } from './pagination.js';
import { getSeason } from './season.js';
import { getSeasonTier, getLifetimeTier } from './tiers.js';

export interface FinalPlayerStat {
  userId: number | null;
  gameId: string;
  team: string | null;
  isWinner: boolean;
  placement: number | null;
  kills: number;
  finalKills: number;
  deaths: number;
  finalDeaths: number;
  bedsBroken: number;
}

export interface ApprovedResultRow {
  matchId: number;
  seasonId: number | null;
  endedAt: string | null;
  reviewedAt: string | null;
  isDraw: boolean;
  winnerTeam: string | null;
  players: FinalPlayerStat[];
}

export function normalizePlayerStat(input: Partial<FinalPlayerStat> & { gameId?: string }): FinalPlayerStat {
  return {
    userId: input.userId ?? null,
    gameId: input.gameId ?? '',
    team: input.team ?? null,
    isWinner: Boolean(input.isWinner),
    placement: input.placement ?? null,
    kills: integer(input.kills),
    finalKills: integer(input.finalKills),
    deaths: integer(input.deaths),
    finalDeaths: integer(input.finalDeaths),
    bedsBroken: integer(input.bedsBroken),
  };
}

function integer(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : 0;
}

/** 读取审核通过/已裁定的正式赛果（按比赛时间升序） */
export function loadApprovedResults(db: DB, seasonId?: number | null): ApprovedResultRow[] {
  const params: unknown[] = [];
  let where = "m.state IN ('approved','resolved')";
  if (seasonId !== undefined && seasonId !== null) {
    where += ' AND m.season_id = ?';
    params.push(seasonId);
  }
  const rows = db
    .prepare(
      `SELECT r.match_id, m.season_id, m.ended_at, m.reviewed_at, r.is_draw, r.winner_team, r.players_json
       FROM match_results r
       JOIN matches m ON m.id = r.match_id
       WHERE ${where}
       ORDER BY COALESCE(m.ended_at, m.reviewed_at, m.created_at) ASC, m.id ASC`,
    )
    .all(...params) as Array<{
    match_id: number;
    season_id: number | null;
    ended_at: string | null;
    reviewed_at: string | null;
    is_draw: number;
    winner_team: string | null;
    players_json: string;
  }>;

  return rows.map((row) => {
    let parsed: unknown = [];
    try {
      parsed = JSON.parse(row.players_json);
    } catch {
      parsed = [];
    }
    const players = Array.isArray(parsed)
      ? (parsed as Array<Partial<FinalPlayerStat>>).map((item) => normalizePlayerStat(item))
      : [];
    return {
      matchId: row.match_id,
      seasonId: row.season_id,
      endedAt: row.ended_at,
      reviewedAt: row.reviewed_at,
      isDraw: row.is_draw === 1,
      winnerTeam: row.winner_team,
      players,
    };
  });
}

export function playerBelongsToUser(player: FinalPlayerStat, userId: number): boolean {
  return player.userId === userId;
}

export interface AggregateStats {
  points: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  deaths: number;
  bedsBroken: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  maxKills: number;
}

function emptyAggregate(points: number): AggregateStats {
  return {
    points,
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    kills: 0,
    deaths: 0,
    bedsBroken: 0,
    winRate: 0,
    currentStreak: 0,
    bestStreak: 0,
    maxKills: 0,
  };
}

function aggregateResults(
  results: ApprovedResultRow[],
  userId: number,
  initialPoints: number,
  minPoints: number,
  transactionSum: number,
): AggregateStats {
  const aggregate = emptyAggregate(clampPoints(initialPoints + transactionSum, minPoints));
  let currentStreak = 0;
  let bestStreak = 0;
  for (const result of results) {
    const player = result.players.find((item) => playerBelongsToUser(item, userId));
    if (!player) continue;
    aggregate.matches += 1;
    aggregate.kills += player.kills;
    aggregate.deaths += player.deaths;
    aggregate.bedsBroken += player.bedsBroken;
    aggregate.maxKills = Math.max(aggregate.maxKills, player.kills);
    if (result.isDraw) {
      aggregate.draws += 1;
      currentStreak = 0;
    } else if (player.isWinner) {
      aggregate.wins += 1;
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      aggregate.losses += 1;
      currentStreak = 0;
    }
  }
  aggregate.bestStreak = bestStreak;
  aggregate.currentStreak = currentStreak;
  aggregate.winRate = aggregate.matches > 0 ? round4(aggregate.wins / aggregate.matches) : 0;
  return aggregate;
}

export function clampPoints(points: number, minPoints: number): number {
  return Math.max(minPoints, Math.round(points));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function transactionSum(db: DB, seasonId: number, userId: number): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(delta), 0) AS total FROM point_transactions WHERE season_id = ? AND user_id = ?',
    )
    .get(seasonId, userId) as { total: number };
  return row.total;
}

/** 从积分流水 + 正式赛果全量重算某玩家赛季统计（保证修正/作废后数据一致） */
export function recomputePlayerSeasonStats(
  db: DB,
  seasonId: number,
  userId: number,
): PlayerStatisticsRow | null {
  const season = getSeason(db, seasonId);
  if (!season) return null;
  const results = loadApprovedResults(db, seasonId);
  const sum = transactionSum(db, seasonId, userId);
  const aggregate = aggregateResults(results, userId, season.initial_points, season.min_points, sum);

  const existing = db
    .prepare('SELECT * FROM player_statistics WHERE user_id = ? AND season_id = ?')
    .get(userId, seasonId) as PlayerStatisticsRow | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO player_statistics
         (user_id, season_id, points, matches, wins, losses, draws, kills, deaths, beds_broken,
          win_rate, current_streak, best_streak, max_kills, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    ).run(
      userId,
      seasonId,
      aggregate.points,
      aggregate.matches,
      aggregate.wins,
      aggregate.losses,
      aggregate.draws,
      aggregate.kills,
      aggregate.deaths,
      aggregate.bedsBroken,
      aggregate.winRate,
      aggregate.currentStreak,
      aggregate.bestStreak,
      aggregate.maxKills,
    );
  } else {
    db.prepare(
      `UPDATE player_statistics SET
         points = ?, matches = ?, wins = ?, losses = ?, draws = ?, kills = ?, deaths = ?,
         beds_broken = ?, win_rate = ?, current_streak = ?, best_streak = ?, max_kills = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(
      aggregate.points,
      aggregate.matches,
      aggregate.wins,
      aggregate.losses,
      aggregate.draws,
      aggregate.kills,
      aggregate.deaths,
      aggregate.bedsBroken,
      aggregate.winRate,
      aggregate.currentStreak,
      aggregate.bestStreak,
      aggregate.maxKills,
      existing.id,
    );
  }

  // 重算流水 balance_after（按时间顺序）
  const transactions = db
    .prepare(
      'SELECT id, delta FROM point_transactions WHERE season_id = ? AND user_id = ? ORDER BY id ASC',
    )
    .all(seasonId, userId) as Array<{ id: number; delta: number }>;
  let balance = season.initial_points;
  const updateBalance = db.prepare('UPDATE point_transactions SET balance_after = ? WHERE id = ?');
  for (const transaction of transactions) {
    balance = clampPoints(balance + transaction.delta, season.min_points);
    updateBalance.run(balance, transaction.id);
  }

  return db
    .prepare('SELECT * FROM player_statistics WHERE user_id = ? AND season_id = ?')
    .get(userId, seasonId) as PlayerStatisticsRow;
}

/** 全量重算某玩家历史累计统计（跨赛季） */
export function recomputeLifetimeStats(db: DB, userId: number): LifetimeStatisticsRow {
  const results = loadApprovedResults(db);
  const totals = aggregateResults(results, userId, 0, Number.NEGATIVE_INFINITY, 0);
  const sumRow = db
    .prepare('SELECT COALESCE(SUM(delta), 0) AS total FROM point_transactions WHERE user_id = ?')
    .get(userId) as { total: number };
  const totalPoints = Math.round(sumRow.total);

  const existing = db.prepare('SELECT * FROM lifetime_statistics WHERE user_id = ?').get(userId) as
    | LifetimeStatisticsRow
    | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO lifetime_statistics
         (user_id, total_points, matches, wins, losses, draws, kills, deaths, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    ).run(
      userId,
      totalPoints,
      totals.matches,
      totals.wins,
      totals.losses,
      totals.draws,
      totals.kills,
      totals.deaths,
    );
  } else {
    db.prepare(
      `UPDATE lifetime_statistics SET
         total_points = ?, matches = ?, wins = ?, losses = ?, draws = ?, kills = ?, deaths = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE user_id = ?`,
    ).run(
      totalPoints,
      totals.matches,
      totals.wins,
      totals.losses,
      totals.draws,
      totals.kills,
      totals.deaths,
      userId,
    );
  }
  return db.prepare('SELECT * FROM lifetime_statistics WHERE user_id = ?').get(userId) as LifetimeStatisticsRow;
}

export interface RankRefreshResult {
  seasonTier: RankTierRow | null;
  lifetimeTier: RankTierRow | null;
  seasonChanged: boolean;
  lifetimeChanged: boolean;
  seasonFrom: string | null;
  lifetimeFrom: string | null;
  points: number;
  totalPoints: number;
}

/** 按当前积分计算段位，并在段位变化时写 rank_history */
export function refreshRankHistory(db: DB, userId: number, seasonId: number): RankRefreshResult {
  const seasonStats = db
    .prepare('SELECT * FROM player_statistics WHERE user_id = ? AND season_id = ?')
    .get(userId, seasonId) as PlayerStatisticsRow | undefined;
  const lifetimeStats = db
    .prepare('SELECT * FROM lifetime_statistics WHERE user_id = ?')
    .get(userId) as LifetimeStatisticsRow | undefined;

  const seasonPoints = seasonStats?.points ?? 0;
  const lifetimePoints = lifetimeStats?.total_points ?? 0;
  const seasonTier = getSeasonTier(db, seasonId, seasonPoints);
  const lifetimeTier = getLifetimeTier(db, lifetimePoints);

  const lastSeason = db
    .prepare(
      "SELECT to_tier FROM rank_history WHERE user_id = ? AND season_id = ? AND kind = 'season' ORDER BY id DESC LIMIT 1",
    )
    .get(userId, seasonId) as { to_tier: string } | undefined;
  const lastLifetime = db
    .prepare(
      "SELECT to_tier FROM rank_history WHERE user_id = ? AND season_id IS NULL AND kind = 'lifetime' ORDER BY id DESC LIMIT 1",
    )
    .get(userId) as { to_tier: string } | undefined;

  const insertHistory = db.prepare(
    'INSERT INTO rank_history (user_id, season_id, kind, from_tier, to_tier, points) VALUES (?, ?, ?, ?, ?, ?)',
  );

  let seasonChanged = false;
  if (seasonTier && seasonTier.name !== lastSeason?.to_tier) {
    insertHistory.run(userId, seasonId, 'season', lastSeason?.to_tier ?? null, seasonTier.name, seasonPoints);
    seasonChanged = true;
  }
  let lifetimeChanged = false;
  if (lifetimeTier && lifetimeTier.name !== lastLifetime?.to_tier) {
    insertHistory.run(userId, null, 'lifetime', lastLifetime?.to_tier ?? null, lifetimeTier.name, lifetimePoints);
    lifetimeChanged = true;
  }

  return {
    seasonTier,
    lifetimeTier,
    seasonChanged,
    lifetimeChanged,
    seasonFrom: lastSeason?.to_tier ?? null,
    lifetimeFrom: lastLifetime?.to_tier ?? null,
    points: seasonPoints,
    totalPoints: lifetimePoints,
  };
}

export interface LeaderboardRow {
  rank: number;
  userId: number;
  nickname: string;
  avatar: string | null;
  gameId: string | null;
  username: string;
  points: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  kills: number;
  deaths: number;
  bedsBroken: number;
  bestStreak: number;
  maxKills: number;
  tier: { name: string; color: string; icon: string | null; minPoints: number } | null;
  teamName?: string | null;
}

interface LeaderboardQueryRow {
  user_id: number;
  nickname: string;
  username: string;
  avatar: string | null;
  game_id: string | null;
  points: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  kills: number;
  deaths: number;
  beds_broken: number;
  best_streak: number;
  max_kills: number;
  team_name?: string | null;
}

export interface LeaderboardOptions {
  includeZeroMatches?: boolean;
}

/** 赛季排行榜：积分↓ 胜率↓ 击杀↓，三项全同并列 */
export function getSeasonLeaderboard(
  db: DB,
  seasonId: number,
  pagination: Pagination,
  options: LeaderboardOptions = {},
): { items: LeaderboardRow[]; total: number } {
  const season = getSeason(db, seasonId);
  if (!season) return { items: [], total: 0 };
  const zeroFilter = options.includeZeroMatches ? '' : 'AND ps.matches > 0';
  const rows = db
    .prepare(
      `SELECT ps.user_id, ps.points, ps.matches, ps.wins, ps.losses, ps.draws, ps.win_rate,
              ps.kills, ps.deaths, ps.beds_broken, ps.best_streak, ps.max_kills,
              u.nickname, u.username, u.avatar, u.game_id,
              (SELECT t.name FROM team_members tm JOIN teams t ON t.id = tm.team_id
                WHERE tm.user_id = ps.user_id AND tm.left_at IS NULL AND t.state = 'active' LIMIT 1) AS team_name
       FROM player_statistics ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.season_id = ? AND u.status = 'active' ${zeroFilter}
       ORDER BY ps.points DESC, ps.win_rate DESC, ps.kills DESC, ps.user_id ASC`,
    )
    .all(seasonId) as LeaderboardQueryRow[];

  const ranked: LeaderboardRow[] = [];
  let previousKey: string | null = null;
  let currentRank = 0;
  rows.forEach((row, index) => {
    const key = `${row.points}|${row.win_rate}|${row.kills}`;
    if (key !== previousKey) {
      currentRank = index + 1;
      previousKey = key;
    }
    const tier = getSeasonTier(db, seasonId, row.points);
    ranked.push({
      rank: currentRank,
      userId: row.user_id,
      nickname: row.nickname,
      username: row.username,
      avatar: row.avatar,
      gameId: row.game_id,
      points: row.points,
      matches: row.matches,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      winRate: row.win_rate,
      kills: row.kills,
      deaths: row.deaths,
      bedsBroken: row.beds_broken,
      bestStreak: row.best_streak,
      maxKills: row.max_kills,
      tier: tier ? { name: tier.name, color: tier.color, icon: tier.icon, minPoints: tier.min_points } : null,
      teamName: row.team_name ?? null,
    });
  });

  const start = pagination.offset;
  return { items: ranked.slice(start, start + pagination.limit), total: ranked.length };
}

/** 玩家在赛季排行榜中的名次（未进榜返回 null） */
export function getUserSeasonRank(db: DB, seasonId: number, userId: number): number | null {
  const rows = db
    .prepare(
      `SELECT ps.user_id, ps.points, ps.win_rate, ps.kills
       FROM player_statistics ps JOIN users u ON u.id = ps.user_id
       WHERE ps.season_id = ? AND ps.matches > 0 AND u.status = 'active'
       ORDER BY ps.points DESC, ps.win_rate DESC, ps.kills DESC, ps.user_id ASC`,
    )
    .all(seasonId) as Array<{ user_id: number; points: number; win_rate: number; kills: number }>;
  let rank = 0;
  let previousKey: string | null = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const key = `${row.points}|${row.win_rate}|${row.kills}`;
    if (key !== previousKey) {
      rank = index + 1;
      previousKey = key;
    }
    if (row.user_id === userId) return rank;
  }
  return null;
}

/** 生成排行榜快照对象（赛季封存用） */
export function buildLeaderboardSnapshot(db: DB, seasonId: number) {
  const pagination: Pagination = { page: 1, pageSize: 100000, limit: 100000, offset: 0 };
  const { items, total } = getSeasonLeaderboard(db, seasonId, pagination, { includeZeroMatches: true });
  return { seasonId, total, generatedAt: new Date().toISOString(), items };
}

export function buildTopLeaderboard(db: DB, seasonId: number, limit = 10): LeaderboardRow[] {
  const pagination: Pagination = { page: 1, pageSize: limit, limit, offset: 0 };
  return getSeasonLeaderboard(db, seasonId, pagination).items;
}

export type { SeasonRow };
