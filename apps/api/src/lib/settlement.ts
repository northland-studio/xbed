import type { DB } from '../db/index.js';
import type {
  MatchPlayerRow,
  MatchResultRow,
  MatchRow,
  SeasonRow,
  UserRow,
} from '../db/models.js';
import { writeAudit } from './audit.js';
import { errors } from './errors.js';
import {
  clampPoints,
  loadApprovedResults,
  normalizePlayerStat,
  recomputeLifetimeStats,
  recomputePlayerSeasonStats,
  refreshRankHistory,
  type FinalPlayerStat,
} from './leaderboard.js';
import { createNotification } from './notifications.js';
import { asBool, parseJson } from './serialize.js';
import { getSeason, isSeasonSealed } from './season.js';
import { nowIso } from './time.js';

export type ReviewAction = 'approve' | 'reject' | 'correct' | 'abnormal' | 'resolve' | 'void';

export interface CorrectedMatchInput {
  winnerTeam?: string | null;
  isDraw?: boolean;
  players?: Array<Partial<FinalPlayerStat> & { gameId?: string }>;
}

export interface ReviewMatchInput {
  action: ReviewAction;
  reason?: string | null;
  corrected?: CorrectedMatchInput | null;
}

export interface ReviewMatchOutput {
  match: MatchRow;
  result: MatchResultRow | null;
  version: number;
  affectedUserIds: number[];
  action: ReviewAction;
  beforeState: string;
  afterState: string;
}

function buildPlayersFromMatch(db: DB, matchId: number): FinalPlayerStat[] {
  const rows = db
    .prepare('SELECT * FROM match_players WHERE match_id = ? ORDER BY id ASC')
    .all(matchId) as MatchPlayerRow[];
  return rows.map((row) =>
    normalizePlayerStat({
      userId: row.user_id,
      gameId: row.game_id,
      team: row.team,
      isWinner: asBool(row.is_winner),
      placement: row.placement,
      kills: row.kills,
      finalKills: row.final_kills,
      deaths: row.deaths,
      finalDeaths: row.final_deaths,
      bedsBroken: row.beds_broken,
    }),
  );
}

function playerKey(player: Pick<FinalPlayerStat, 'userId' | 'gameId'>): string {
  return player.userId !== null && player.userId !== undefined
    ? `u:${player.userId}`
    : `g:${player.gameId.toLowerCase()}`;
}

function mergeCorrectedPlayers(base: FinalPlayerStat[], corrected?: CorrectedMatchInput | null): FinalPlayerStat[] {
  if (!corrected?.players || corrected.players.length === 0) return base;
  const merged = new Map<string, FinalPlayerStat>();
  const addBase = (player: FinalPlayerStat): void => {
    merged.set(playerKey(player), player);
    if (player.gameId) merged.set(`g:${player.gameId.toLowerCase()}`, player);
  };
  for (const player of base) addBase(player);

  for (const patch of corrected.players) {
    const candidates: string[] = [];
    if (patch.userId !== null && patch.userId !== undefined) candidates.push(`u:${patch.userId}`);
    if (patch.gameId) candidates.push(`g:${patch.gameId.toLowerCase()}`);
    let existing: FinalPlayerStat | undefined;
    for (const key of candidates) {
      existing = merged.get(key);
      if (existing) break;
    }
    if (existing) {
      const definedPatch = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== null && value !== undefined),
      ) as Partial<FinalPlayerStat>;
      const updated: FinalPlayerStat = {
        ...existing,
        ...definedPatch,
        userId: existing.userId,
        gameId: existing.gameId,
      };
      addBase(updated);
    } else {
      const created = normalizePlayerStat(patch);
      addBase(created);
    }
  }
  // 去重（同一玩家可能被 u:/g: 两个 key 引用）
  const unique = new Map<string, FinalPlayerStat>();
  for (const player of merged.values()) {
    unique.set(playerKey(player), player);
  }
  return Array.from(unique.values());
}

function registeredUserIds(db: DB, seasonId: number): Set<number> {
  const rows = db
    .prepare("SELECT user_id FROM registrations WHERE season_id = ? AND state = 'active'")
    .all(seasonId) as Array<{ user_id: number }>;
  return new Set(rows.map((row) => row.user_id));
}

function matchStateNote(db: DB, matchId: number): { reviews: number; resultVersion: number } {
  const reviews = (
    db.prepare('SELECT COUNT(*) AS c FROM match_reviews WHERE match_id = ?').get(matchId) as { c: number }
  ).c;
  const result = db.prepare('SELECT version FROM match_results WHERE match_id = ?').get(matchId) as
    | { version: number }
    | undefined;
  return { reviews, resultVersion: result?.version ?? 0 };
}

const ALLOWED_FROM: Record<ReviewAction, MatchRow['state'][]> = {
  approve: ['pending', 'in_review', 'rejected', 'abnormal', 'resolved'],
  reject: ['pending', 'in_review', 'abnormal'],
  correct: ['approved', 'resolved'],
  abnormal: ['pending', 'in_review', 'rejected', 'resolved'],
  resolve: ['abnormal', 'rejected', 'pending', 'in_review'],
  void: ['pending', 'in_review', 'rejected', 'approved', 'abnormal', 'resolved'],
};

const TARGET_STATE: Record<ReviewAction, MatchRow['state']> = {
  approve: 'approved',
  reject: 'rejected',
  correct: 'approved',
  abnormal: 'abnormal',
  resolve: 'resolved',
  void: 'void',
};

/**
 * 赛果审核 + 积分结算（单事务，任何一步失败整体回滚）。
 *
 * - approve：生成/更新 match_results、写积分流水、重算统计/段位/通知/审计
 * - correct：更新赛果版本，按新旧差值写修正流水并全量重算
 * - void：作废旧赛果，写冲正流水并全量重算
 * - reject/abnormal：仅改状态并留痕
 */
export function reviewMatch(
  db: DB,
  input: {
    matchId: number;
    reviewer: UserRow;
    action: ReviewAction;
    reason?: string | null;
    corrected?: CorrectedMatchInput | null;
    ip?: string | null;
  },
): ReviewMatchOutput {
  const run = db.transaction((): ReviewMatchOutput => {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(input.matchId) as
      | MatchRow
      | undefined;
    if (!match) throw errors.notFound('比赛不存在');

    const action = input.action;
    const reason = (input.reason ?? '').trim();
    if (!ALLOWED_FROM[action].includes(match.state)) {
      throw errors.conflict(`当前状态 ${match.state} 不允许执行 ${action} 操作`);
    }
    if ((action === 'reject' || action === 'correct' || action === 'abnormal' || action === 'void') && !reason) {
      throw errors.invalidRequest(`${action} 操作必须填写理由`);
    }

    const season: SeasonRow | null = match.season_id ? getSeason(db, match.season_id) : null;
    const settles = action === 'approve' || action === 'correct' || (action === 'resolve' && Boolean(input.corrected)) || action === 'void';
    if (settles) {
      if (!season) throw errors.conflict('比赛尚未归属赛季，请先指定赛季后再结算');
      if (isSeasonSealed(season)) throw errors.conflict('赛季已封存，禁止常规成绩修改');
    }

    const existingResult = db.prepare('SELECT * FROM match_results WHERE match_id = ?').get(match.id) as
      | MatchResultRow
      | undefined;
    if (action === 'correct' && !existingResult) {
      throw errors.conflict('该比赛尚无正式赛果，不能执行修正');
    }
    if (action === 'approve' && existingResult) {
      throw errors.conflict('该比赛已有正式赛果，重复审核不会重复结算；如需修改请使用修正');
    }

    const basePlayers = buildPlayersFromMatch(db, match.id);
    const finalPlayers = mergeCorrectedPlayers(basePlayers, input.corrected);

    const correctedWinner = input.corrected?.winnerTeam !== undefined ? input.corrected.winnerTeam : match.winner_team;
    const correctedIsDraw =
      input.corrected?.isDraw !== undefined ? Boolean(input.corrected.isDraw) : asBool(match.is_draw);

    let result: MatchResultRow | null = existingResult ?? null;
    let version = existingResult?.version ?? 0;
    const beforeState = match.state;
    const afterState: MatchRow['state'] =
      action === 'correct' && match.state === 'resolved' ? 'resolved' : TARGET_STATE[action];

    // 先更新比赛主记录状态：后续按 matches.state 全量重算统计（approved/resolved 才计入）
    db.prepare(
      `UPDATE matches SET state = ?, winner_team = ?, is_draw = ?,
         reviewed_at = ?, reviewed_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(
      afterState,
      action === 'void' ? match.winner_team : correctedWinner ?? match.winner_team,
      action === 'void' ? 0 : correctedIsDraw ? 1 : 0,
      nowIso(),
      input.reviewer.id,
      match.id,
    );

    // 1) 赛果版本 + 正式结果
    if (settles) {
      version = (existingResult?.version ?? 0) + 1;
      const playersJson = JSON.stringify(finalPlayers);
      db.prepare(
        `INSERT INTO match_result_versions (match_id, version, before_json, after_json, reason, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        match.id,
        version,
        existingResult?.players_json ?? null,
        playersJson,
        reason || (action === 'approve' ? '赛果审核通过' : action === 'void' ? '赛果作废' : '赛果修正'),
        input.reviewer.id,
      );

      if (existingResult) {
        db.prepare(
          `UPDATE match_results SET version = ?, winner_team = ?, is_draw = ?, players_json = ?,
             approved_by = ?, approved_at = ?, note = ? WHERE id = ?`,
        ).run(
          version,
          action === 'void' ? null : correctedWinner ?? null,
          correctedIsDraw ? 1 : 0,
          playersJson,
          input.reviewer.id,
          nowIso(),
          reason || null,
          existingResult.id,
        );
      } else {
        db.prepare(
          `INSERT INTO match_results (match_id, version, winner_team, is_draw, players_json, approved_by, approved_at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          match.id,
          version,
          correctedWinner ?? null,
          correctedIsDraw ? 1 : 0,
          playersJson,
          input.reviewer.id,
          nowIso(),
          reason || null,
        );
      }

      // 2) 积分流水：首次结算写 match_*，修正/作废按差值写修正流水
      const eligible = registeredUserIds(db, season!.id);
      const desired = new Map<number, { delta: number; reason: string }>();
      if (action !== 'void') {
        for (const player of finalPlayers) {
          if (player.userId === null || !eligible.has(player.userId)) continue;
          const delta = correctedIsDraw
            ? season!.draw_points
            : player.isWinner
              ? season!.win_points
              : season!.loss_points;
          desired.set(player.userId, {
            delta,
            reason: correctedIsDraw ? 'match_draw' : player.isWinner ? 'match_win' : 'match_loss',
          });
        }
      }

      const previousRows = db
        .prepare(
          'SELECT user_id, COALESCE(SUM(delta), 0) AS total FROM point_transactions WHERE match_id = ? GROUP BY user_id',
        )
        .all(match.id) as Array<{ user_id: number; total: number }>;
      const previous = new Map(previousRows.map((row) => [row.user_id, row.total]));
      const affected = new Set<number>([...desired.keys(), ...previous.keys()]);

      const insertTx = db.prepare(
        `INSERT INTO point_transactions
           (season_id, user_id, match_id, delta, reason, balance_after, created_by, note)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      );

      if (version === 1) {
        for (const [userId, item] of desired) {
          db.prepare(
            `INSERT OR IGNORE INTO point_transactions
               (season_id, user_id, match_id, delta, reason, balance_after, created_by, note)
             VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
          ).run(
            season!.id,
            userId,
            match.id,
            item.delta,
            item.reason,
            input.reviewer.id,
            reason || null,
          );
        }
      } else {
        for (const userId of affected) {
          const wanted = desired.get(userId)?.delta ?? 0;
          const previousDelta = previous.get(userId) ?? 0;
          const net = wanted - previousDelta;
          if (net === 0) continue;
          insertTx.run(
            season!.id,
            userId,
            match.id,
            net,
            action === 'void' ? 'match_void' : `match_correction_v${version}`,
            input.reviewer.id,
            reason || null,
          );
        }
      }

      // 3) 重算统计 / 历史 / 段位
      const affectedList = Array.from(affected);
      for (const userId of affectedList) {
        recomputePlayerSeasonStats(db, season!.id, userId);
        recomputeLifetimeStats(db, userId);
        const rank = refreshRankHistory(db, userId, season!.id);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
        if (!user) continue;
        const wanted = desired.get(userId)?.delta;
        if (action === 'void') {
          createNotification(db, {
            userId,
            type: 'match_result',
            title: '赛果作废',
            content: `${match.arena_display || match.arena || '比赛'} 的赛果已被作废，相关积分已冲正。${reason ? `理由：${reason}` : ''}`,
            link: `/matches/${match.id}`,
          });
        } else {
          createNotification(db, {
            userId,
            type: 'match_result',
            title: '赛果公布',
            content: `${match.arena_display || match.arena || '比赛'} 已审核通过，${correctedIsDraw ? '本场平局' : finalPlayers.find((p) => p.userId === userId)?.isWinner ? '你获得胜利' : '本场未获胜'}${wanted === undefined ? '' : `，积分 ${wanted > 0 ? '+' : ''}${wanted}`}。`,
            link: `/matches/${match.id}`,
          });
          if (rank.seasonChanged && rank.seasonTier) {
            createNotification(db, {
              userId,
              type: 'rank_change',
              title: `段位变化：${rank.seasonTier.name}`,
              content: `你的赛季段位由 ${rank.seasonFrom ?? '未定级'} 变为 ${rank.seasonTier.name}（当前积分 ${rank.points}）。`,
              link: '/me/profile',
            });
          }
        }
      }
    }

    // 4) 审核记录
    db.prepare(
      `INSERT INTO match_reviews (match_id, reviewer_id, action, reason, before_state, after_state)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(match.id, input.reviewer.id, action, reason || null, beforeState, afterState);

    // 5) 审计
    const before = { state: beforeState, ...matchStateNote(db, match.id) };
    const after = { state: afterState, resultVersion: version, action, reason: reason || null };
    writeAudit(db, {
      actorUserId: input.reviewer.id,
      actorXuanjianId: input.reviewer.xuanjian_user_id,
      action: `match.${action}`,
      targetType: 'match',
      targetId: match.id,
      before,
      after,
      reason: reason || null,
      ip: input.ip ?? null,
    });

    const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id) as MatchRow;
    result = db.prepare('SELECT * FROM match_results WHERE match_id = ?').get(match.id) as
      | MatchResultRow
      | undefined ?? null;

    return {
      match: updatedMatch,
      result: result ?? null,
      version,
      affectedUserIds: [],
      action,
      beforeState,
      afterState,
    };
  });

  return run();
}

/** 管理员手动调整积分（写审计 + 流水 + 重算统计/段位） */
export function adjustPoints(
  db: DB,
  input: {
    seasonId: number;
    userId: number;
    delta: number;
    reason: string;
    reviewer: UserRow;
    ip?: string | null;
  },
): { transactionId: number; points: number } {
  const run = db.transaction(() => {
    const season = getSeason(db, input.seasonId);
    if (!season) throw errors.notFound('赛季不存在');
    if (isSeasonSealed(season)) throw errors.conflict('赛季已封存，禁止修改积分');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(input.userId) as UserRow | undefined;
    if (!user) throw errors.notFound('用户不存在');

    const info = db
      .prepare(
        `INSERT INTO point_transactions
           (season_id, user_id, match_id, delta, reason, balance_after, created_by, note)
         VALUES (?, ?, NULL, ?, 'admin_adjust', NULL, ?, ?)`,
      )
      .run(input.seasonId, input.userId, input.delta, input.reviewer.id, input.reason);

    recomputePlayerSeasonStats(db, input.seasonId, input.userId);
    recomputeLifetimeStats(db, input.userId);
    refreshRankHistory(db, input.userId, input.seasonId);
    const stats = db
      .prepare('SELECT points FROM player_statistics WHERE user_id = ? AND season_id = ?')
      .get(input.userId, input.seasonId) as { points: number } | undefined;

    createNotification(db, {
      userId: input.userId,
      type: 'points_change',
      title: '积分调整',
      content: `管理员调整了你在 ${season.name} 的积分：${input.delta > 0 ? '+' : ''}${input.delta}。理由：${input.reason}`,
      link: '/me/profile',
    });

    writeAudit(db, {
      actorUserId: input.reviewer.id,
      actorXuanjianId: input.reviewer.xuanjian_user_id,
      action: 'points.adjust',
      targetType: 'user',
      targetId: input.userId,
      before: { seasonId: input.seasonId, points: (stats?.points ?? 0) - input.delta },
      after: { seasonId: input.seasonId, points: stats?.points ?? null, delta: input.delta },
      reason: input.reason,
      ip: input.ip ?? null,
    });

    return { transactionId: Number(info.lastInsertRowid), points: stats?.points ?? 0 };
  });
  return run();
}

export function listPointTransactions(
  db: DB,
  filter: { seasonId?: number; userId?: number; pageSize: number; offset: number },
): { rows: Array<Record<string, unknown>>; total: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.seasonId) {
    conditions.push('pt.season_id = ?');
    params.push(filter.seasonId);
  }
  if (filter.userId) {
    conditions.push('pt.user_id = ?');
    params.push(filter.userId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM point_transactions pt ${where}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT pt.*, u.nickname FROM point_transactions pt
       LEFT JOIN users u ON u.id = pt.user_id
       ${where} ORDER BY pt.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, filter.pageSize, filter.offset) as Array<Record<string, unknown>>;
  return { rows, total };
}

/** 内部一致性校验辅助（供后台/测试）：某玩家赛季统计与流水是否一致 */
export function verifyUserSeasonConsistency(db: DB, seasonId: number, userId: number): boolean {
  const season = getSeason(db, seasonId);
  const stats = db
    .prepare('SELECT points FROM player_statistics WHERE user_id = ? AND season_id = ?')
    .get(userId, seasonId) as { points: number } | undefined;
  if (!season || !stats) return false;
  const sum = db
    .prepare('SELECT COALESCE(SUM(delta),0) AS total FROM point_transactions WHERE season_id = ? AND user_id = ?')
    .get(seasonId, userId) as { total: number };
  return stats.points === clampPoints(season.initial_points + sum.total, season.min_points);
}

export function parseResultPlayers(result: MatchResultRow | null): FinalPlayerStat[] {
  if (!result) return [];
  return parseJson<Array<Partial<FinalPlayerStat>>>(result.players_json, []).map((item) =>
    normalizePlayerStat(item),
  );
}

export { loadApprovedResults };
