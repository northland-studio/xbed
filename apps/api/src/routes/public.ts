import { Router } from 'express';
import type { AppContext } from '../app.js';
import type {
  AnnouncementRow,
  LifetimeStatisticsRow,
  MatchEventRow,
  MatchPlayerRow,
  MatchRow,
  PlayerStatisticsRow,
  RegistrationFieldRow,
  SeasonRow,
  UserRow,
} from '../db/models.js';
import { errors } from '../lib/errors.js';
import { listResponse, parseId, parseOptionalInt, parsePagination } from '../lib/pagination.js';
import { asBool, parseJson } from '../lib/serialize.js';
import {
  buildTopLeaderboard,
  getSeasonLeaderboard,
  getUserSeasonRank,
} from '../lib/leaderboard.js';
import { getCurrentSeason, getSeason, listSeasons } from '../lib/season.js';
import { getLifetimeTier, getSeasonTier, listRankTiers } from '../lib/tiers.js';
import {
  announcementPublic,
  matchPublic,
  publicUser,
  rankTierPublic,
  registrationFieldPublic,
  seasonPublic,
  tierBrief,
} from '../lib/serialize.js';
import { nowIso } from '../lib/time.js';

function publishedSeasonOr404(db: AppContext['db'], id: number): SeasonRow {
  const season = getSeason(db, id);
  if (!season || season.state === 'draft') throw errors.notFound('赛季不存在');
  return season;
}

export function createPublicRouter(ctx: AppContext): Router {
  const { db } = ctx;
  const router = Router();

  router.get('/stats/overview', (_req, res) => {
    const seasons = db
      .prepare(
        "SELECT COUNT(*) AS c FROM seasons WHERE state IN ('registration','running','sealed','archived')",
      )
      .get() as { c: number };
    const matches = db
      .prepare("SELECT COUNT(*) AS c FROM matches WHERE state IN ('approved','resolved')")
      .get() as { c: number };
    const players = db
      .prepare("SELECT COUNT(DISTINCT user_id) AS c FROM registrations WHERE state = 'active'")
      .get() as { c: number };
    const kills = db.prepare('SELECT COALESCE(SUM(kills),0) AS c FROM player_statistics').get() as {
      c: number;
    };
    const pending = db
      .prepare("SELECT COUNT(*) AS c FROM matches WHERE state IN ('pending','in_review')")
      .get() as { c: number };
    const current = getCurrentSeason(db);
    res.status(200).json({
      seasons: seasons.c,
      matches: matches.c,
      players: players.c,
      totalKills: kills.c,
      pendingReviews: pending.c,
      currentSeason: current ? seasonPublic(current) : null,
    });
  });

  router.get('/seasons', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const all = listSeasons(db);
    const items = all.map((season) => {
      const count = db
        .prepare("SELECT COUNT(*) AS c FROM registrations WHERE season_id = ? AND state = 'active'")
        .get(season.id) as { c: number };
      return seasonPublic(season, count.c);
    });
    res
      .status(200)
      .json(listResponse(items.slice(pagination.offset, pagination.offset + pagination.limit), items.length, pagination));
  });

  router.get('/seasons/:id', (req, res) => {
    const season = publishedSeasonOr404(db, parseId(req.params.id, '赛季 ID'));
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM registrations WHERE season_id = ? AND state = 'active'")
      .get(season.id) as { c: number };
    const fields = db
      .prepare('SELECT * FROM registration_fields WHERE season_id = ? ORDER BY sort_order, id')
      .all(season.id) as RegistrationFieldRow[];
    const rules = db
      .prepare('SELECT version, payload, note, created_at FROM season_rules WHERE season_id = ? ORDER BY version DESC LIMIT 1')
      .get(season.id) as { version: number; payload: string; note: string | null; created_at: string } | undefined;
    res.status(200).json({
      ...seasonPublic(season, count.c),
      registrationCount: count.c,
      fields: fields.map(registrationFieldPublic),
      leaderboardTop: buildTopLeaderboard(db, season.id, 10),
      rules: rules ? { version: rules.version, payload: parseJson<unknown>(rules.payload, null), note: rules.note, createdAt: rules.created_at } : null,
    });
  });

  router.get('/seasons/:id/leaderboard', (req, res) => {
    const season = publishedSeasonOr404(db, parseId(req.params.id, '赛季 ID'));
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const result = getSeasonLeaderboard(db, season.id, pagination);
    res.status(200).json(listResponse(result.items, result.total, pagination));
  });

  router.get('/seasons/:id/matches', (req, res) => {
    const season = publishedSeasonOr404(db, parseId(req.params.id, '赛季 ID'));
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const total = (
      db
        .prepare("SELECT COUNT(*) AS c FROM matches WHERE season_id = ? AND state IN ('approved','resolved')")
        .get(season.id) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT * FROM matches WHERE season_id = ? AND state IN ('approved','resolved')
         ORDER BY COALESCE(ended_at, created_at) DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(season.id, pagination.limit, pagination.offset) as MatchRow[];
    res.status(200).json(
      listResponse(
        rows.map((row) =>
          matchPublic(row, {
            season: { id: season.id, name: season.name, code: season.code },
            hasResult: true,
          }),
        ),
        total,
        pagination,
      ),
    );
  });

  router.get('/matches', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const seasonId = parseOptionalInt(req.query.seasonId);
    const conditions: string[] = ["m.state IN ('approved','resolved')"];
    const params: unknown[] = [];
    if (seasonId) {
      conditions.push('m.season_id = ?');
      params.push(seasonId);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM matches m ${where}`).get(...params) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT m.* FROM matches m ${where}
         ORDER BY COALESCE(m.ended_at, m.created_at) DESC, m.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pagination.limit, pagination.offset) as MatchRow[];
    const items = rows.map((row) => {
      const season = row.season_id ? getSeason(db, row.season_id) : null;
      return matchPublic(row, {
        season: season ? { id: season.id, name: season.name, code: season.code } : null,
        hasResult: true,
      });
    });
    res.status(200).json(listResponse(items, total, pagination));
  });

  router.get('/matches/:id', (req, res) => {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(parseId(req.params.id, '比赛 ID')) as
      | MatchRow
      | undefined;
    if (!match) throw errors.notFound('比赛不存在或尚未公布');
    const published = ['approved', 'resolved'].includes(match.state);
    const viewerId = req.auth?.user.id ?? null;
    // 未公布（待审核 / 异常 / 已拒绝）的比赛只对参赛玩家本人与管理员可见，
    // 否则参赛玩家在赛果公布前无法进入详情页提交证据。
    const viewerIsParticipant = viewerId
      ? Boolean(
          db.prepare('SELECT 1 FROM match_players WHERE match_id = ? AND user_id = ?').get(match.id, viewerId),
        )
      : false;
    const viewerIsAdmin = Boolean(req.auth && req.auth.user.level >= 1);
    if (!published && !viewerIsParticipant && !viewerIsAdmin) {
      throw errors.notFound('比赛不存在或尚未公布');
    }
    const players = db
      .prepare('SELECT * FROM match_players WHERE match_id = ? ORDER BY COALESCE(placement, 99), id')
      .all(match.id) as MatchPlayerRow[];
    const events = db
      .prepare('SELECT * FROM match_events WHERE match_id = ? ORDER BY (at IS NULL), at, id')
      .all(match.id) as MatchEventRow[];
    const nicknames = nicknameMap(db, players.map((player) => player.user_id));
    const season = match.season_id ? getSeason(db, match.season_id) : null;
    res.status(200).json({
      ...matchPublic(match, {
        players,
        events,
        nicknames,
        season: season ? { id: season.id, name: season.name, code: season.code } : null,
        hasResult: published,
      }),
      published,
      viewerIsParticipant,
    });
  });

  router.get('/players/:userId', (req, res) => {
    const userId = parseId(req.params.userId, '用户 ID');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!user || user.status !== 'active') throw errors.notFound('玩家不存在');

    const statsRows = db
      .prepare(
        `SELECT ps.*, s.name AS season_name, s.code AS season_code, s.state AS season_state
         FROM player_statistics ps JOIN seasons s ON s.id = ps.season_id
         WHERE ps.user_id = ? ORDER BY COALESCE(s.start_at, s.created_at) DESC, s.id DESC`,
      )
      .all(userId) as Array<PlayerStatisticsRow & { season_name: string; season_code: string; season_state: string }>;

    const current = getCurrentSeason(db);
    const currentStats = current
      ? (statsRows.find((row) => row.season_id === current.id) ?? null)
      : null;
    const currentTier = current ? getSeasonTier(db, current.id, currentStats?.points ?? current.initial_points) : null;
    const currentRank = current ? getUserSeasonRank(db, current.id, userId) : null;

    const lifetimeRow =
      (db.prepare('SELECT * FROM lifetime_statistics WHERE user_id = ?').get(userId) as
        | LifetimeStatisticsRow
        | undefined) ?? {
        user_id: userId,
        total_points: 0,
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        kills: 0,
        deaths: 0,
        updated_at: nowIso(),
      };
    const lifetimeTier = getLifetimeTier(db, lifetimeRow.total_points);

    const seasons = statsRows.map((row) => {
      const tier = getSeasonTier(db, row.season_id, row.points);
      const rank = getUserSeasonRank(db, row.season_id, userId);
      return {
        seasonId: row.season_id,
        seasonName: row.season_name,
        seasonCode: row.season_code,
        seasonState: row.season_state,
        points: row.points,
        matches: row.matches,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        winRate: row.win_rate,
        kills: row.kills,
        deaths: row.deaths,
        bedsBroken: row.beds_broken,
        rank,
        tier: tierBrief(tier),
      };
    });

    const bestWinRate = statsRows.reduce((best, row) => Math.max(best, row.win_rate), 0);
    const records = {
      maxKills: statsRows.reduce((best, row) => Math.max(best, row.max_kills), 0),
      bestStreak: statsRows.reduce((best, row) => Math.max(best, row.best_streak), 0),
      bestWinRate,
      lifetimeMaxKills: lifetimeRow.kills,
      totalMatches: lifetimeRow.matches,
    };

    const recentMatches = db
      .prepare(
        `SELECT m.*, mp.kills, mp.deaths, mp.is_winner, mp.team AS player_team, mp.placement,
                mp.final_kills, mp.final_deaths, mp.beds_broken, r.version AS result_version
         FROM match_players mp
         JOIN matches m ON m.id = mp.match_id
         LEFT JOIN match_results r ON r.match_id = m.id
         WHERE mp.user_id = ? AND m.state IN ('approved','resolved')
         ORDER BY COALESCE(m.ended_at, m.created_at) DESC, m.id DESC LIMIT 20`,
      )
      .all(userId) as Array<
      MatchRow & {
        kills: number;
        deaths: number;
        is_winner: number;
        player_team: string | null;
        placement: number | null;
        final_kills: number;
        final_deaths: number;
        beds_broken: number;
        result_version: number | null;
      }
    >;

    res.status(200).json({
      user: publicUser(user),
      seasonTier: tierBrief(currentTier),
      lifetimeTier: tierBrief(lifetimeTier),
      lifetimePoints: lifetimeRow.total_points,
      seasons,
      currentSeason: current
        ? {
            seasonId: current.id,
            seasonName: current.name,
            points: currentStats?.points ?? current.initial_points,
            matches: currentStats?.matches ?? 0,
            wins: currentStats?.wins ?? 0,
            losses: currentStats?.losses ?? 0,
            draws: currentStats?.draws ?? 0,
            winRate: currentStats?.win_rate ?? 0,
            kills: currentStats?.kills ?? 0,
            deaths: currentStats?.deaths ?? 0,
            bedsBroken: currentStats?.beds_broken ?? 0,
            rank: currentRank,
            tier: tierBrief(currentTier),
          }
        : null,
      lifetime: {
        totalPoints: lifetimeRow.total_points,
        matches: lifetimeRow.matches,
        wins: lifetimeRow.wins,
        losses: lifetimeRow.losses,
        draws: lifetimeRow.draws,
        kills: lifetimeRow.kills,
        deaths: lifetimeRow.deaths,
        tier: tierBrief(lifetimeTier),
      },
      records,
      recentMatches: recentMatches.map((row) => ({
        id: row.id,
        arena: row.arena,
        arenaDisplay: row.arena_display,
        mode: row.mode,
        state: row.state,
        endedAt: row.ended_at,
        winnerTeam: row.winner_team,
        isDraw: asBool(row.is_draw),
        player: {
          kills: row.kills,
          finalKills: row.final_kills,
          deaths: row.deaths,
          finalDeaths: row.final_deaths,
          bedsBroken: row.beds_broken,
          isWinner: asBool(row.is_winner),
          team: row.player_team,
          placement: row.placement,
        },
      })),
    });
  });

  router.get('/players/:userId/matches', (req, res) => {
    const userId = parseId(req.params.userId, '用户 ID');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!user) throw errors.notFound('玩家不存在');
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 20 });
    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM match_players mp JOIN matches m ON m.id = mp.match_id
           WHERE mp.user_id = ? AND m.state IN ('approved','resolved')`,
        )
        .get(userId) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT m.*, mp.kills, mp.deaths, mp.is_winner, mp.team AS player_team, mp.placement,
                mp.final_kills, mp.final_deaths, mp.beds_broken
         FROM match_players mp JOIN matches m ON m.id = mp.match_id
         WHERE mp.user_id = ? AND m.state IN ('approved','resolved')
         ORDER BY COALESCE(m.ended_at, m.created_at) DESC, m.id DESC LIMIT ? OFFSET ?`,
      )
      .all(userId, pagination.limit, pagination.offset) as Array<
      MatchRow & {
        kills: number;
        deaths: number;
        is_winner: number;
        player_team: string | null;
        placement: number | null;
        final_kills: number;
        final_deaths: number;
        beds_broken: number;
      }
    >;
    const items = rows.map((row) => ({
      id: row.id,
      seasonId: row.season_id,
      arena: row.arena,
      arenaDisplay: row.arena_display,
      mode: row.mode,
      endedAt: row.ended_at,
      winnerTeam: row.winner_team,
      isDraw: asBool(row.is_draw),
      player: {
        kills: row.kills,
        finalKills: row.final_kills,
        deaths: row.deaths,
        finalDeaths: row.final_deaths,
        bedsBroken: row.beds_broken,
        isWinner: asBool(row.is_winner),
        team: row.player_team,
        placement: row.placement,
      },
    }));
    res.status(200).json(listResponse(items, total, pagination));
  });

  router.get('/announcements', (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 10 });
    const total = (
      db.prepare('SELECT COUNT(*) AS c FROM announcements WHERE published = 1').get() as { c: number }
    ).c;
    const rows = db
      .prepare(
        'SELECT * FROM announcements WHERE published = 1 ORDER BY pinned DESC, created_at DESC, id DESC LIMIT ? OFFSET ?',
      )
      .all(pagination.limit, pagination.offset) as AnnouncementRow[];
    res.status(200).json(listResponse(rows.map(announcementPublic), total, pagination));
  });

  router.get('/announcements/:id', (req, res) => {
    const row = db
      .prepare('SELECT * FROM announcements WHERE id = ? AND published = 1')
      .get(parseId(req.params.id, '公告 ID')) as AnnouncementRow | undefined;
    if (!row) throw errors.notFound('公告不存在');
    res.status(200).json(announcementPublic(row));
  });

  router.get('/rank-tiers', (req, res) => {
    const seasonId = parseOptionalInt(req.query.seasonId);
    const season = seasonId ? publishedSeasonOr404(db, seasonId) : getCurrentSeason(db);
    const seasonTiers = season
      ? listRankTiers(db, { kind: 'season', seasonId: season.id }).filter(
          (tier) => tier.season_id === null || tier.season_id === season.id,
        )
      : [];
    const lifetimeTiers = listRankTiers(db, { kind: 'lifetime' });
    res.status(200).json({
      items: seasonTiers.map(rankTierPublic),
      lifetime: lifetimeTiers.map(rankTierPublic),
      seasonId: season?.id ?? null,
    });
  });

  return router;
}

/** 批量查询用户昵称 */
export function nicknameMap(db: AppContext['db'], userIds: Array<number | null>): Map<number, string> {
  const ids = Array.from(new Set(userIds.filter((id): id is number => typeof id === 'number')));
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, nickname FROM users WHERE id IN (${placeholders})`)
    .all(...ids) as Array<{ id: number; nickname: string }>;
  for (const row of rows) map.set(row.id, row.nickname);
  return map;
}
