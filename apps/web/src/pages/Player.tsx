import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, toList } from '../lib/api';
import {
  Avatar,
  Badge,
  Card,
  CardHead,
  Empty,
  ErrorState,
  Loading,
  Pagination,
  StatCard,
  TierChip,
} from '../components/ui';
import { MatchCard } from '../components/cards';
import { AreaTrendChart } from '../components/Charts';
import { fmtDate, fmtDateTime, fmtNum, fmtRate } from '../lib/format';
import type { Match, Paginated, PlayerProfile } from '../types';

export function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const [matchPage, setMatchPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['player', userId],
    queryFn: () => get<PlayerProfile>(`/players/${userId}`),
    enabled: Number.isFinite(userId),
  });

  const { data: matchHistory } = useQuery({
    queryKey: ['player', userId, 'matches', matchPage],
    queryFn: async () =>
      toList<Match>(await get<Paginated<Match>>(`/players/${userId}/matches`, { page: matchPage, pageSize: 10 })),
    enabled: Number.isFinite(userId),
  });

  if (isLoading) {
    return (
      <div className="container">
        <Loading text="正在加载玩家档案…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="container">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data?.user) {
    return (
      <div className="container">
        <Empty icon="◎" text="玩家不存在" extra="该玩家可能尚未参加过任何正式比赛。" />
      </div>
    );
  }

  const user = data.user;
  const stats = data.currentSeason ?? data.stats ?? {};
  const lifetime = data.lifetime ?? {};
  const records = data.records ?? {};
  const trend = (data.trend ?? []).map((t) => ({ ...t, date: t.date ? fmtDate(t.date) : '' }));

  return (
    <div className="container">
      <div className="profile-hero mb-16">
        <div className="profile-head">
          <Avatar src={user.avatar} name={user.nickname || user.username} size="xl" />
          <div className="flex-1">
            <div className="profile-name">{user.nickname || user.username || `玩家 ${user.id}`}</div>
            <div className="row row-wrap mt-8" style={{ gap: 8 }}>
              {user.username ? <span className="tag">@{user.username}</span> : null}
              {typeof user.level === 'number' ? <span className="tag">玄剑 Lv.{user.level}</span> : null}
              {user.title ? <span className="tag">{user.title}</span> : null}
              {user.gameId ? <span className="tag">游戏 ID：{user.gameId}</span> : null}
              {typeof user.contribution === 'number' ? (
                <span className="tag">贡献点 {fmtNum(Math.round(user.contribution))}</span>
              ) : null}
            </div>
            <div className="profile-tags">
              <span className="dim" style={{ fontSize: 12 }}>
                当前赛季段位
              </span>
              <TierChip tier={stats.tier} />
              <span className="dim" style={{ fontSize: 12, marginLeft: 10 }}>
                永久历史段位
              </span>
              <TierChip tier={data.lifetimeTier} />
            </div>
          </div>
          <div className="stat-inline">
            <div>
              <div className="si-v">{fmtNum(stats.points ?? lifetime.totalPoints)}</div>
              <div className="si-k">赛季积分</div>
            </div>
            <div>
              <div className="si-v">{fmtRate(stats.winRate)}</div>
              <div className="si-k">胜率</div>
            </div>
            <div>
              <div className="si-v">{fmtNum(stats.matches ?? lifetime.matches)}</div>
              <div className="si-k">总场次</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-4 mb-16">
        <StatCard label="赛季场次" value={fmtNum(stats.matches ?? 0)} hint={`${stats.wins ?? 0} 胜 / ${stats.losses ?? 0} 负 / ${stats.draws ?? 0} 平`} accent />
        <StatCard label="总击杀" value={fmtNum(stats.kills ?? 0)} hint={`死亡 ${fmtNum(stats.deaths ?? 0)}`} />
        <StatCard label="摧毁床" value={fmtNum(stats.bedsBroken ?? 0)} hint="本赛季累计" />
        <StatCard label="当前连胜" value={fmtNum(stats.currentStreak ?? 0)} hint={`最佳连胜 ${fmtNum(stats.bestStreak ?? records.bestStreak ?? 0)}`} />
      </div>

      <div className="grid grid-side">
        <div className="stack">
          <Card>
            <CardHead title="最佳纪录" />
            <div className="card-body tight">
              <div className="grid grid-2" style={{ gap: 14 }}>
                <div>
                  <div className="dim" style={{ fontSize: 12 }}>最高单场击杀</div>
                  <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{fmtNum(records.maxKills ?? stats.maxKills ?? 0)}</div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 12 }}>最长连胜</div>
                  <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{fmtNum(records.bestStreak ?? stats.bestStreak ?? 0)}</div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 12 }}>最佳胜率</div>
                  <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{fmtRate(records.bestWinRate)}</div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 12 }}>历史最高排名</div>
                  <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{records.highestRank ? `#${records.highestRank}` : '—'}</div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="chart-card">
            <CardHead
              title="积分 / 击杀趋势"
              extra={<span className="dim" style={{ fontSize: 12 }}>基于已审核通过的比赛</span>}
            />
            <div className="card-body">
              <AreaTrendChart
                data={trend}
                xKey="date"
                series={[
                  { key: 'points', label: '积分', color: '#8b5cf6' },
                  { key: 'kills', label: '击杀', color: '#22d3ee' },
                ]}
                height={260}
              />
            </div>
          </Card>

          <Card>
            <CardHead title="历届赛季" extra={<span className="dim" style={{ fontSize: 12 }}>仅展示已参赛赛季</span>} />
            {!data.seasons?.length ? (
              <Empty text="暂无赛季记录" />
            ) : (
              <div className="table-wrap responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>赛季</th>
                      <th className="right">积分</th>
                      <th className="right">场次</th>
                      <th className="right">胜率</th>
                      <th className="right">击杀</th>
                      <th className="right">排名</th>
                      <th>段位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.seasons.map((s) => (
                      <tr key={s.seasonId}>
                        <td>
                          <Link to={`/seasons/${s.seasonId}`} style={{ color: 'var(--purple-soft)' }}>
                            {s.seasonName || `赛季 ${s.seasonId}`}
                          </Link>
                        </td>
                        <td className="right num">{s.points ?? 0}</td>
                        <td className="right num">{s.matches ?? 0}</td>
                        <td className="right num">{fmtRate(s.winRate)}</td>
                        <td className="right num">{s.kills ?? 0}</td>
                        <td className="right num">{s.rank ? `#${s.rank}` : '—'}</td>
                        <td>
                          <TierChip tier={s.tier} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="近期比赛" extra={<Link to={`/players/${userId}`} className="dim" style={{ fontSize: 12 }}>近 20 场</Link>} />
            {!data.recentMatches?.length ? (
              <Empty text="暂无比赛记录" />
            ) : (
              <div>
                {data.recentMatches.slice(0, 8).map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="个人资料" />
            <div className="card-body tight">
              <div className="kv-list">
                <div className="kv">
                  <span className="k">玄剑用户名</span>
                  <span className="v">{user.username || '—'}</span>
                </div>
                <div className="kv">
                  <span className="k">游戏 ID</span>
                  <span className="v">{user.gameId || '—'}</span>
                </div>
                <div className="kv">
                  <span className="k">玄剑等级</span>
                  <span className="v">Lv.{user.level ?? 0}</span>
                </div>
                <div className="kv">
                  <span className="k">公会称号</span>
                  <span className="v">{user.title || '—'}</span>
                </div>
                <div className="kv">
                  <span className="k">永久积分</span>
                  <span className="v num">{fmtNum(lifetime.totalPoints ?? 0)}</span>
                </div>
                <div className="kv">
                  <span className="k">历史总场次</span>
                  <span className="v num">{fmtNum(lifetime.matches ?? 0)}</span>
                </div>
                <div className="kv">
                  <span className="k">加入时间</span>
                  <span className="v">{fmtDateTime(user.createdAt)}</span>
                </div>
              </div>
            </div>
          </Card>

          {data.rankHistory?.length ? (
            <Card>
              <CardHead title="段位变化" />
              <div className="card-body tight">
                <div className="timeline">
                  {data.rankHistory.slice(0, 10).map((h) => (
                    <div className="timeline-item" key={h.id}>
                      <div className="timeline-time">{fmtDate(h.createdAt)}</div>
                      <div className="timeline-text">
                        {h.fromTier ? `${h.fromTier} → ` : ''}
                        <span style={{ color: 'var(--purple-soft)' }}>{h.toTier}</span>
                        {typeof h.points === 'number' ? <span className="dim">（{h.points} 分）</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-16">
        <CardHead title="比赛历史" extra={<span className="dim" style={{ fontSize: 12 }}>仅展示审核通过的比赛</span>} />
        {!matchHistory?.items.length ? (
          <Empty text="暂无比赛历史" />
        ) : (
          <>
            <div className="table-wrap responsive-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>比赛</th>
                    <th>地图</th>
                    <th>结果</th>
                    <th className="right">击杀</th>
                    <th className="right">死亡</th>
                    <th className="right">摧毁床</th>
                    <th className="right">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {matchHistory.items.map((m) => {
                    const me = m.players?.find((p) => p.userId === userId);
                    return (
                      <tr key={m.id}>
                        <td>
                          <Link to={`/matches/${m.id}`} style={{ color: 'var(--purple-soft)' }}>
                            #{m.id}
                          </Link>
                        </td>
                        <td>{m.arenaDisplay || m.arena || '—'}</td>
                        <td>
                          {m.isDraw ? (
                            <Badge kind="cyan">平局</Badge>
                          ) : me ? (
                            me.isWinner ? <Badge kind="green">胜利</Badge> : <Badge kind="gray">失败</Badge>
                          ) : (
                            <span className="dim">—</span>
                          )}
                        </td>
                        <td className="right num">{me?.kills ?? '—'}</td>
                        <td className="right num">{me?.deaths ?? '—'}</td>
                        <td className="right num">{me?.bedsBroken ?? '—'}</td>
                        <td className="right num">{fmtDateTime(m.endedAt || m.startedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination
                page={matchHistory.page || matchPage}
                pageSize={matchHistory.pageSize || 10}
                total={matchHistory.total}
                onChange={setMatchPage}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
