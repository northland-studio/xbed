import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, toList } from '../lib/api';
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Loading,
  PageHead,
  Pagination,
  Podium,
  RankMedal,
  UserCell,
} from '../components/ui';
import { SEASON_STATE, SEASON_STATE_BADGE, label, badge } from '../lib/labels';
import { fmtNum, fmtRate } from '../lib/format';
import type { LeaderboardEntry, Paginated, Season } from '../types';

const PAGE_SIZE = 20;

export function LeaderboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const seasonIdParam = searchParams.get('seasonId');
  const [page, setPage] = useState(1);

  const { data: seasons } = useQuery({
    queryKey: ['seasons', 'list'],
    queryFn: async () => toList<Season>(await get<Paginated<Season>>('/seasons')),
    staleTime: 60_000,
  });

  const defaultSeason = useMemo(() => {
    const items = seasons?.items ?? [];
    return items.find((s) => s.state === 'running') ?? items.find((s) => s.state === 'registration') ?? items[0];
  }, [seasons]);

  const seasonId = Number(seasonIdParam) || defaultSeason?.id;
  const season = seasons?.items.find((s) => s.id === seasonId) ?? defaultSeason;

  useEffect(() => {
    setPage(1);
  }, [seasonId]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['leaderboard', seasonId, page],
    queryFn: async () =>
      toList<LeaderboardEntry>(
        await get<Paginated<LeaderboardEntry>>(`/seasons/${seasonId}/leaderboard`, {
          page,
          pageSize: PAGE_SIZE,
        }),
      ),
    enabled: !!seasonId,
  });

  const { data: topData } = useQuery({
    queryKey: ['leaderboard', seasonId, 'top'],
    queryFn: async () =>
      toList<LeaderboardEntry>(
        await get<Paginated<LeaderboardEntry>>(`/seasons/${seasonId}/leaderboard`, { page: 1, pageSize: 3 }),
      ),
    enabled: !!seasonId,
  });

  const setSeason = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('seasonId', id);
    else next.delete('seasonId');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="container">
      <PageHead
        title="排行榜"
        desc="排序规则：总积分 ↓ → 胜率 ↓ → 总击杀 ↓，三项仍相同则并列。赛果审核通过后排行榜立即更新，公开排行与后台数据保持一致。"
        actions={
          <select className="select" style={{ height: 36, width: 'auto' }} value={seasonId ?? ''} onChange={(e) => setSeason(e.target.value)}>
            {(seasons?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{label(SEASON_STATE, s.state)}）
              </option>
            ))}
          </select>
        }
      />

      {!seasonId ? (
        <Empty text="暂无可展示的赛季" />
      ) : season ? (
        <div className="row row-wrap mb-16" style={{ gap: 10 }}>
          <Badge kind={badge(SEASON_STATE_BADGE, season.state)}>{label(SEASON_STATE, season.state)}</Badge>
          <span className="tag">{season.code || `S${season.id}`}</span>
          <span className="dim" style={{ fontSize: 12.5 }}>
            参赛玩家 {fmtNum(season.registrationCount ?? season.playerCount)} 人 · 初始积分 {season.initialPoints ?? 60}
          </span>
          <Link to={`/seasons/${season.id}`} className="section-more" style={{ marginLeft: 'auto' }}>
            赛季详情 →
          </Link>
        </div>
      ) : null}

      {!seasonId ? null : isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.items.length ? (
        <Empty icon="▤" text="排行榜暂无数据" extra="赛季开始后，审核通过的比赛会逐步累积积分并生成排名。" />
      ) : (
        <>
          {page === 1 && topData?.items.length ? <Podium entries={topData.items} /> : null}

          <Card>
            <div className="table-wrap responsive-table">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>排名</th>
                    <th>玩家</th>
                    <th className="right">积分</th>
                    <th className="right">场次</th>
                    <th className="right">胜 / 负 / 平</th>
                    <th className="right">胜率</th>
                    <th className="right">击杀</th>
                    <th className="right">死亡</th>
                    <th>段位</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e, i) => {
                    const rank = e.rank ?? (page - 1) * PAGE_SIZE + i + 1;
                    return (
                      <tr key={e.userId} className={rank <= 3 ? `rank-${rank}` : undefined}>
                        <td>
                          <RankMedal rank={rank} />
                        </td>
                        <td>
                          <UserCell
                            name={e.nickname}
                            sub={e.gameId || `ID ${e.userId}`}
                            avatar={e.avatar}
                            to={`/players/${e.userId}`}
                          />
                        </td>
                        <td className="right num" style={{ color: 'var(--text)', fontWeight: 700 }}>
                          {e.points ?? 0}
                        </td>
                        <td className="right num">{e.matches ?? 0}</td>
                        <td className="right num">
                          <span className="ok">{e.wins ?? 0}</span> / <span className="danger">{e.losses ?? 0}</span> /{' '}
                          <span className="muted">{e.draws ?? 0}</span>
                        </td>
                        <td className="right num">{fmtRate(e.winRate)}</td>
                        <td className="right num">{e.kills ?? 0}</td>
                        <td className="right num">{e.deaths ?? 0}</td>
                        <td>
                          {e.tier?.name ? (
                            <span className="tier-chip" style={{ color: e.tier.color || '#8b5cf6' }}>
                              <span className="tier-dot" />
                              {e.tier.name}
                            </span>
                          ) : (
                            <span className="dim">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination
                page={data.page || page}
                pageSize={data.pageSize || PAGE_SIZE}
                total={data.total}
                onChange={setPage}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
