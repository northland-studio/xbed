import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, toList } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Badge,
  Card,
  CardHead,
  Empty,
  ErrorState,
  Loading,
  RankMedal,
  SectionHead,
  UserCell,
} from '../components/ui';
import { AnnouncementRow, MatchCard } from '../components/cards';
import { SEASON_STATE, SEASON_STATE_BADGE, MATCH_STATE, MATCH_STATE_BADGE, label, badge } from '../lib/labels';
import { fmtDateTime, fmtNum, fmtRange, fmtRate } from '../lib/format';
import type { Announcement, LeaderboardEntry, Match, OverviewStats, Paginated, Season, SeasonDetail } from '../types';

const VIDEO_URL = 'https://cdn.xuanjian.top/xbed.mp4';

/** 首屏背景视频；加载失败自动回退到渐变 + 动态线条，绝不出现破图 */
function Hero() {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { isLoggedIn } = useAuth();

  const { data: seasons } = useQuery({
    queryKey: ['home', 'seasons'],
    queryFn: async () => toList<Season>(await get<Paginated<Season>>('/seasons')).items,
    staleTime: 60_000,
  });

  const currentSeason = useMemo(() => {
    if (!seasons?.length) return null;
    return seasons.find((s) => s.state === 'running') ?? seasons.find((s) => s.state === 'registration') ?? seasons[0];
  }, [seasons]);

  const registerTo = currentSeason ? `/seasons/${currentSeason.id}/register` : '/seasons';

  return (
    <section className="hero">
      <div className="hero-fallback">
        <div className="geo">
          <div className="geo-lines" />
          <div className="geo-lines cyan" />
          <div className="geo-slash s1" />
          <div className="geo-slash s2" />
          <div className="geo-slash s3" />
          <div className="geo-slash s4" />
        </div>
      </div>

      {!failed ? (
        <video
          className="hero-video"
          src={VIDEO_URL}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 900ms ease' }}
          onLoadedData={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}

      <div className="hero-overlay" />

      <div className="container hero-inner">
        <img className="hero-logo" src="/logo.png" alt="XBed Logo" />
        <div className="hero-badge">
          <span className="dot" />
          XBed Season 1 · 玄剑公会内部赛事
        </div>
        <h1 className="hero-title">
          登顶，从<span className="grad">每一次击杀</span>
          <br />
          开始
        </h1>
        <p className="hero-desc">
          XBed 玄剑起床战争挑战赛 S1。以赛季积分、双重段位、证据核验与长期竞技档案，构建一套可持续运转的公会竞技制度。
        </p>
        <div className="hero-cta">
          <Link
            className="btn btn-primary btn-lg"
            to={isLoggedIn ? registerTo : `/login?redirect=${encodeURIComponent(registerTo)}`}
          >
            立即参赛
          </Link>
          <Link className="btn btn-outline btn-lg" to="/leaderboard">
            查看排行榜
          </Link>
        </div>
        {currentSeason ? (
          <div className="hero-stats">
            <div>
              <div className="hero-stat-value">{currentSeason.code || `S${currentSeason.id}`}</div>
              <div className="hero-stat-label">当前赛季</div>
            </div>
            <div>
              <div className="hero-stat-value">{label(SEASON_STATE, currentSeason.state)}</div>
              <div className="hero-stat-label">赛季状态</div>
            </div>
            <div>
              <div className="hero-stat-value">
                {currentSeason.registrationCount ?? currentSeason.playerCount ?? '—'}
              </div>
              <div className="hero-stat-label">报名玩家</div>
            </div>
            <div>
              <div className="hero-stat-value num">+{currentSeason.winPoints ?? 5}</div>
              <div className="hero-stat-label">单场胜利积分</div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatsStrip() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => get<OverviewStats>('/stats/overview'),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="stat-strip">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div className="skeleton" style={{ height: 26, width: '60%', margin: '0 auto' }} />
            <div className="skeleton" style={{ height: 10, width: '40%', margin: '10px auto 0' }} />
          </div>
        ))}
      </div>
    );
  }
  if (error) return <ErrorState error={error} />;

  const s = data ?? {};
  const items = [
    { k: '赛季总数', v: s.seasons ?? 0 },
    { k: '比赛场次', v: s.matches ?? 0 },
    { k: '参与玩家', v: s.players ?? 0 },
    { k: '总击杀数', v: s.totalKills ?? 0 },
    { k: '待审核赛果', v: s.pendingReviews ?? 0 },
  ];
  return (
    <div className="stat-strip">
      {items.map((it) => (
        <div key={it.k}>
          <div className="v">{fmtNum(it.v)}</div>
          <div className="k">{it.k}</div>
        </div>
      ))}
    </div>
  );
}

function CurrentSeasonSection() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['home', 'seasons'],
    queryFn: async () => toList<Season>(await get<Paginated<Season>>('/seasons')).items,
    staleTime: 60_000,
  });

  const current = useMemo(() => {
    if (!data?.length) return null;
    return data.find((s) => s.state === 'running') ?? data.find((s) => s.state === 'registration') ?? data[0];
  }, [data]);

  const { data: detail } = useQuery({
    queryKey: ['home', 'season', current?.id],
    queryFn: () => get<SeasonDetail>(`/seasons/${current!.id}`),
    enabled: !!current?.id,
    staleTime: 30_000,
  });

  return (
    <section className="section">
      <div className="container">
        <SectionHead
          title="当前赛季"
          desc="S1 面向玄剑公会成员开放，报名通过后即可参加该赛季所有符合条件的正式比赛"
          extra={
            <Link to="/seasons" className="section-more">
              全部赛季 →
            </Link>
          }
        />
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !current ? (
          <Empty text="暂无已发布的赛季" extra="超级管理员创建并发布赛季后将在此展示。" />
        ) : (
          <div className="grid grid-side">
            <div className="card">
              <div className="card-head">
                <div className="card-title">
                  <span className="bar" />
                  {current.name}
                </div>
                <Badge kind={badge(SEASON_STATE_BADGE, current.state)}>{label(SEASON_STATE, current.state)}</Badge>
              </div>
              <div className="card-body">
                <p className="muted" style={{ lineHeight: 1.9, fontSize: 13.5 }}>
                  {current.description || '赛季介绍待补充。'}
                </p>
                <div className="grid grid-2 mt-16" style={{ gap: 12 }}>
                  <div className="stat-card">
                    <div className="stat-label">赛程</div>
                    <div className="stat-value" style={{ fontSize: 15 }}>
                      {fmtRange(current.startAt, current.endAt)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">报名人数</div>
                    <div className="stat-value">{fmtNum(detail?.registrationCount ?? current.registrationCount)}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">积分规则</div>
                    <div className="stat-value" style={{ fontSize: 15 }}>
                      <span className="ok">胜 +{current.winPoints ?? 5}</span>
                      <span className="dim"> / </span>
                      <span className="danger">负 {current.lossPoints ?? -5}</span>
                      <span className="dim"> / </span>
                      <span>平 {current.drawPoints ?? 0}</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">初始积分 / 下限</div>
                    <div className="stat-value">
                      {current.initialPoints ?? 60}
                      <span className="dim" style={{ fontSize: 16 }}>
                        {' '}
                        / {current.minPoints ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="row mt-16">
                  <Link to={`/seasons/${current.id}`} className="btn btn-outline btn-sm">
                    赛季详情
                  </Link>
                  {detail?.fields?.length ? <span className="tag">含 {detail.fields.length} 项自定义报名字段</span> : null}
                  {current.registrationOpen !== false && current.state === 'registration' ? (
                    <Link to={`/seasons/${current.id}/register`} className="btn btn-primary btn-sm">
                      立即报名
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
            <Card>
              <CardHead title="报名状态" />
              <div className="card-body tight">
                <div className="kv-list">
                  <div className="kv">
                    <span className="k">报名窗口</span>
                    <span className="v">
                      {current.state === 'registration' && current.registrationOpen !== false ? (
                        <Badge kind="green">开放中</Badge>
                      ) : current.state === 'draft' ? (
                        <Badge kind="gray">未开放</Badge>
                      ) : (
                        <Badge kind="yellow">已关闭</Badge>
                      )}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="k">报名方式</span>
                    <span className="v">玄剑账号登录后在线报名</span>
                  </div>
                  <div className="kv">
                    <span className="k">参赛资格</span>
                    <span className="v">玄剑公会成员 · 邮箱已验证</span>
                  </div>
                  <div className="kv">
                    <span className="k">审核方式</span>
                    <span className="v">符合资格后自动通过</span>
                  </div>
                  <div className="kv">
                    <span className="k">比赛模式</span>
                    <span className="v">{current.matchModes?.join('、') || '全部'}</span>
                  </div>
                </div>
                <Link to="/seasons" className="btn btn-ghost btn-sm btn-block mt-16">
                  查看赛季规则与报名字段
                </Link>
              </div>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: '◈',
    title: '统一积分体系',
    desc: '所有正式比赛执行统一规则：胜 +5、负 −5、平 0。不设倍率、不搞特殊场，排名即时更新。',
  },
  {
    icon: '◆',
    title: '双重段位',
    desc: '赛季段位随每季积分重新计算，永久历史段位累积长期竞技荣誉，两套段位独立管理。',
  },
  {
    icon: '▣',
    title: '证据交叉核验',
    desc: '服务器原始数据 + 玩家 latest.log + ReplayMod 回放三方对照，管理员逐场审核后赛果才正式生效。',
  },
  {
    icon: '◷',
    title: '长期竞技档案',
    desc: '历届排名、段位变化、最佳纪录与趋势图表全部沉淀，构建可持续的个人竞技档案。',
  },
];

function IntroSection() {
  return (
    <section
      className="section"
      style={{ background: 'linear-gradient(180deg, transparent, rgba(139,92,246,0.05), transparent)' }}
    >
      <div className="container">
        <SectionHead title="赛事介绍" desc="XBed 不只是一个战绩展示网站，而是玄剑公会内部竞技制度的一次实验" />
        <div className="grid grid-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="card-pad" hoverable>
              <div
                className="num"
                style={{
                  fontSize: 22,
                  color: '#a78bfa',
                  marginBottom: 12,
                  width: 42,
                  height: 42,
                  display: 'grid',
                  placeItems: 'center',
                  border: '1px solid rgba(139,92,246,0.35)',
                  borderRadius: 10,
                  background: 'rgba(139,92,246,0.1)',
                }}
              >
                {f.icon}
              </div>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>{f.title}</h3>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.85 }}>
                {f.desc}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function LeaderboardTop() {
  const { data: seasons } = useQuery({
    queryKey: ['home', 'seasons'],
    queryFn: async () => toList<Season>(await get<Paginated<Season>>('/seasons')).items,
    staleTime: 60_000,
  });
  const current =
    seasons?.find((s) => s.state === 'running') ?? seasons?.find((s) => s.state === 'registration') ?? seasons?.[0];

  const { data, isLoading, error } = useQuery({
    queryKey: ['home', 'leaderboard', current?.id],
    queryFn: async () =>
      toList<LeaderboardEntry>(
        await get<Paginated<LeaderboardEntry>>(`/seasons/${current!.id}/leaderboard`, { page: 1, pageSize: 10 }),
      ),
    enabled: !!current?.id,
    staleTime: 30_000,
  });

  return (
    <section className="section tight">
      <div className="container">
        <SectionHead
          title="实时排行榜"
          desc={current ? `${current.name} · 积分 ↓ 胜率 ↓ 击杀 ↓` : '当前赛季前十名'}
          extra={
            <Link to="/leaderboard" className="section-more">
              完整排行榜 →
            </Link>
          }
        />
        <Card>
          {!current ? (
            <Empty text="暂无可展示的排行榜" />
          ) : isLoading ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} />
          ) : !data?.items.length ? (
            <Empty text="排行榜暂无数据" extra="赛果审核通过后会自动更新。" />
          ) : (
            <div className="table-wrap responsive-table">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 64 }}>排名</th>
                    <th>玩家</th>
                    <th className="right">积分</th>
                    <th className="right">场次</th>
                    <th className="right">胜率</th>
                    <th className="right">击杀</th>
                    <th>段位</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e, i) => (
                    <tr key={e.userId} className={i < 3 ? `rank-${i + 1}` : undefined}>
                      <td>
                        <RankMedal rank={e.rank ?? i + 1} />
                      </td>
                      <td>
                        <UserCell
                          name={e.nickname}
                          sub={e.gameId || `ID ${e.userId}`}
                          avatar={e.avatar}
                          to={`/players/${e.userId}`}
                        />
                      </td>
                      <td className="right num">{e.points ?? 0}</td>
                      <td className="right num">{e.matches ?? 0}</td>
                      <td className="right num">{fmtRate(e.winRate)}</td>
                      <td className="right num">{e.kills ?? 0}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

function RecentMatches() {
  const { data: recent, isLoading, error } = useQuery({
    queryKey: ['home', 'matches', 'recent'],
    queryFn: async () => toList<Match>(await get<Paginated<Match>>('/matches', { page: 1, pageSize: 6 })),
    staleTime: 30_000,
  });

  const { data: results } = useQuery({
    queryKey: ['home', 'matches', 'results'],
    queryFn: async () =>
      toList<Match>(await get<Paginated<Match>>('/matches', { page: 1, pageSize: 4, state: 'approved' })),
    staleTime: 30_000,
  });

  return (
    <section className="section tight">
      <div className="container grid grid-2">
        <Card>
          <CardHead
            title="近期比赛"
            extra={
              <Link to="/matches" className="section-more">
                全部比赛 →
              </Link>
            }
          />
          {isLoading ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} />
          ) : !recent?.items.length ? (
            <Empty text="暂无比赛记录" />
          ) : (
            <div>
              {recent.items.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHead
            title="近期赛果"
            extra={
              <Link to="/matches?state=approved" className="section-more">
                赛果列表 →
              </Link>
            }
          />
          {!results?.items.length ? (
            <Empty text="暂无已审核通过的赛果" />
          ) : (
            <div className="card-body tight">
              {results.items.map((m) => (
                <Link key={m.id} to={`/matches/${m.id}`} className="kv" style={{ padding: '11px 0', display: 'flex' }}>
                  <span className="k">
                    <Badge kind={badge(MATCH_STATE_BADGE, m.state)}>{label(MATCH_STATE, m.state)}</Badge>
                  </span>
                  <span className="v">
                    {m.arenaDisplay || m.arena || '未知地图'} · {m.isDraw ? '平局' : `胜者 ${m.winnerTeam ?? '—'}`}
                    <div className="dim" style={{ fontSize: 11 }}>
                      {fmtDateTime(m.endedAt || m.startedAt)}
                    </div>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

function AnnouncementsSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['home', 'announcements'],
    queryFn: async () => toList<Announcement>(await get<Paginated<Announcement>>('/announcements', { page: 1, pageSize: 5 })),
    staleTime: 60_000,
  });

  return (
    <section className="section tight">
      <div className="container">
        <SectionHead
          title="赛事公告"
          desc="赛季规则、赛程安排与重要通知"
          extra={
            <Link to="/announcements" className="section-more">
              全部公告 →
            </Link>
          }
        />
        <Card>
          {isLoading ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} />
          ) : !data?.items.length ? (
            <Empty text="暂无公告" />
          ) : (
            <div style={{ padding: '4px 4px' }}>
              {data.items.map((a) => (
                <AnnouncementRow key={a.id} item={a} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <>
      <Hero />
      <section className="section tight">
        <div className="container">
          <StatsStrip />
        </div>
      </section>
      <CurrentSeasonSection />
      <LeaderboardTop />
      <IntroSection />
      <RecentMatches />
      <AnnouncementsSection />
    </>
  );
}
