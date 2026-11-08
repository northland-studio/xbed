import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, toList } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Alert,
  Badge,
  Card,
  CardHead,
  Empty,
  ErrorState,
  JsonBlock,
  Loading,
  PageHead,
  Pagination,
  RankMedal,
  UserCell,
} from '../components/ui';
import { MatchCard } from '../components/cards';
import {
  SEASON_STATE,
  SEASON_STATE_BADGE,
  label,
  badge,
} from '../lib/labels';
import { fmtDateTime, fmtNum, fmtRange, fmtRate } from '../lib/format';
import type { LeaderboardEntry, Match, Paginated, Registration, SeasonDetail } from '../types';

function RulesBlock({ detail }: { detail: SeasonDetail }) {
  const rules = detail.rules;
  const entries: [string, string][] = [
    ['胜利积分', `+${detail.winPoints ?? 5}`],
    ['失败积分', `${detail.lossPoints ?? -5}`],
    ['平局积分', `${detail.drawPoints ?? 0}`],
    ['初始积分', `${detail.initialPoints ?? 60}`],
    ['积分下限', `${detail.minPoints ?? 0}`],
    ['计入模式', detail.matchModes?.length ? detail.matchModes.join('、') : '全部'],
    ['地图白名单', detail.mapWhitelist?.length ? detail.mapWhitelist.join('、') : '不限'],
    ['奖励说明', detail.rewardNote || '由公会管理组决定'],
  ];

  const payload = rules?.payload as Record<string, unknown> | undefined;
  const extraRules =
    payload && !Array.isArray(payload)
      ? Object.entries(payload).filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      : [];

  return (
    <Card>
      <CardHead
        title="赛季规则"
        extra={rules?.version ? <span className="tag">规则版本 v{rules.version}</span> : null}
      />
      <div className="card-body tight">
        <div className="kv-list">
          {entries.map(([k, v]) => (
            <div className="kv" key={k}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
          {extraRules.map(([k, v]) => (
            <div className="kv" key={k}>
              <span className="k">{k}</span>
              <span className="v">{String(v)}</span>
            </div>
          ))}
        </div>
        {payload && typeof payload === 'object' && extraRules.length === 0 ? (
          <>
            <div className="divider" />
            <JsonBlock value={payload} />
          </>
        ) : null}
      </div>
    </Card>
  );
}

function RegisterCard({ detail, myReg }: { detail: SeasonDetail; myReg?: Registration | null }) {
  const { isLoggedIn } = useAuth();
  const registerOpen =
    (detail.state === 'registration' || detail.state === 'running') && detail.registrationOpen !== false;
  const isLateRegister = detail.state === 'running';

  let body;
  if (myReg) {
    body = (
      <>
        <Alert kind="ok">
          你已报名该赛季
          {myReg.gameId ? `，游戏 ID：${myReg.gameId}` : ''}。
          {myReg.state === 'revoked' ? '（报名资格已被取消，如有疑问请通过申诉渠道反馈）' : ''}
        </Alert>
        <div className="kv-list mt-12">
          <div className="kv">
            <span className="k">报名时间</span>
            <span className="v">{fmtDateTime(myReg.createdAt)}</span>
          </div>
          <div className="kv">
            <span className="k">状态</span>
            <span className="v">
              {myReg.state === 'revoked' ? <Badge kind="red">已取消资格</Badge> : <Badge kind="green">有效</Badge>}
            </span>
          </div>
        </div>
        {myReg.state === 'active' ? (
          <Link to="/me" className="btn btn-outline btn-sm btn-block mt-12">
            查看我的报名
          </Link>
        ) : null}
      </>
    );
  } else if (!registerOpen) {
    body = (
      <Alert kind="warn">
        当前赛季报名未开放。{detail.state === 'running' ? '赛季进行中，但补报通道已关闭。' : ''}
      </Alert>
    );
  } else if (!isLoggedIn) {
    body = (
      <>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
          报名需使用玄剑账号登录，并确保邮箱已验证。报名后即获得该赛季参赛资格，无需逐场报名。
        </p>
        <Link
          to={`/login?redirect=${encodeURIComponent(`/seasons/${detail.id}/register`)}`}
          className="btn btn-primary btn-block mt-12"
        >
          登录并报名
        </Link>
      </>
    );
  } else {
    body = (
      <>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
          {isLateRegister
            ? '赛季已开始，当前为补报：报名后只统计后续完成的正式比赛，补报前的比赛不计入成绩。'
            : '报名窗口开放中。填写游戏 ID 与赛季自定义字段后即可提交，符合资格将立即通过。'}
        </p>
        <Link to={`/seasons/${detail.id}/register`} className="btn btn-primary btn-block mt-12">
          {isLateRegister ? '补报参赛' : '立即报名'}
        </Link>
      </>
    );
  }

  return (
    <Card>
      <CardHead title="报名入口" />
      <div className="card-body tight">{body}</div>
    </Card>
  );
}

export function SeasonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const seasonId = Number(id);
  const [page, setPage] = useState(1);
  const [matchPage, setMatchPage] = useState(1);
  const { isLoggedIn } = useAuth();

  const { data: detail, isLoading, error, refetch } = useQuery({
    queryKey: ['season', seasonId],
    queryFn: () => get<SeasonDetail>(`/seasons/${seasonId}`),
    enabled: Number.isFinite(seasonId),
  });

  const { data: board } = useQuery({
    queryKey: ['season', seasonId, 'leaderboard', page],
    queryFn: async () =>
      toList<LeaderboardEntry>(
        await get<Paginated<LeaderboardEntry>>(`/seasons/${seasonId}/leaderboard`, { page, pageSize: 20 }),
      ),
    enabled: Number.isFinite(seasonId),
  });

  const { data: matches } = useQuery({
    queryKey: ['season', seasonId, 'matches', matchPage],
    queryFn: async () =>
      toList<Match>(await get<Paginated<Match>>(`/seasons/${seasonId}/matches`, { page: matchPage, pageSize: 10 })),
    enabled: Number.isFinite(seasonId),
  });

  const { data: myRegistrations } = useQuery({
    queryKey: ['me', 'registrations'],
    queryFn: async () => toList<Registration>(await get<Paginated<Registration>>('/me/registrations')),
    enabled: isLoggedIn,
    retry: false,
  });

  const myReg = myRegistrations?.items.find((r) => r.seasonId === seasonId) ?? null;

  const canRegister =
    (detail?.state === 'registration' || detail?.state === 'running') && detail?.registrationOpen !== false;
  const isLateRegister = detail?.state === 'running';

  if (isLoading) {
    return (
      <div className="container">
        <Loading text="正在加载赛季详情…" />
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
  if (!detail) {
    return (
      <div className="container">
        <Empty icon="◷" text="赛季不存在" extra="该赛季可能尚未发布或已被删除。" />
      </div>
    );
  }

  const state = detail.state ?? 'draft';

  return (
    <div className="container">
      <PageHead
        title={detail.name}
        desc={
          <>
            {detail.code ? <span className="tag" style={{ marginRight: 8 }}>{detail.code}</span> : null}
            <Badge kind={badge(SEASON_STATE_BADGE, state)}>{label(SEASON_STATE, state)}</Badge>
            <span style={{ marginLeft: 10 }}>赛程：{fmtRange(detail.startAt, detail.endAt)}</span>
          </>
        }
        actions={
          <>
            <Link to="/seasons" className="btn btn-ghost btn-sm">
              返回赛事中心
            </Link>
            {canRegister ? (
              <Link to={`/seasons/${detail.id}/register`} className="btn btn-primary btn-sm">
                {isLateRegister ? '补报参赛' : '报名参赛'}
              </Link>
            ) : null}
          </>
        }
      />

      {detail.description ? (
        <Card className="mb-16">
          <div className="card-body">
            <p className="prose">{detail.description}</p>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-side">
        <div className="stack">
          <Card>
            <CardHead
              title="赛季排行榜"
              extra={<span className="dim" style={{ fontSize: 12 }}>积分 ↓ 胜率 ↓ 击杀 ↓</span>}
            />
            {!board || !board.items.length ? (
              <Empty text="排行榜暂无数据" />
            ) : (
              <>
                <div className="table-wrap responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>排名</th>
                        <th>玩家</th>
                        <th className="right">积分</th>
                        <th className="right">场次</th>
                        <th className="right">胜率</th>
                        <th className="right">击杀</th>
                        <th>段位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.items.map((e, i) => (
                        <tr key={e.userId}>
                          <td>
                            <RankMedal rank={e.rank ?? (page - 1) * 20 + i + 1} />
                          </td>
                          <td>
                            <UserCell
                              name={e.nickname}
                              sub={e.gameId}
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
                <div style={{ padding: '0 16px' }}>
                  <Pagination
                    page={board.page || page}
                    pageSize={board.pageSize || 20}
                    total={board.total}
                    onChange={setPage}
                  />
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHead title="赛季比赛" extra={<Link to={`/matches?seasonId=${detail.id}`} className="section-more">全部比赛 →</Link>} />
            {!matches || !matches.items.length ? (
              <Empty text="本赛季暂无比赛记录" extra="服务器上报并通过审核的比赛会出现在这里。" />
            ) : (
              <>
                <div>
                  {matches.items.map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
                <div style={{ padding: '0 16px' }}>
                  <Pagination
                    page={matches.page || matchPage}
                    pageSize={matches.pageSize || 10}
                    total={matches.total}
                    onChange={setMatchPage}
                  />
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="stack">
          <RegisterCard detail={detail} myReg={myReg} />
          <Card>
            <CardHead title="赛季信息" />
            <div className="card-body tight">
              <div className="kv-list">
                <div className="kv">
                  <span className="k">赛季编号</span>
                  <span className="v">{detail.code || `#${detail.id}`}</span>
                </div>
                <div className="kv">
                  <span className="k">开始 / 结束</span>
                  <span className="v">
                    {fmtDateTime(detail.startAt)}
                    <br />
                    {fmtDateTime(detail.endAt)}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">报名人数</span>
                  <span className="v num">{fmtNum(detail.registrationCount)}</span>
                </div>
                <div className="kv">
                  <span className="k">封存时间</span>
                  <span className="v">{detail.sealedAt ? fmtDateTime(detail.sealedAt) : '未封存'}</span>
                </div>
              </div>
            </div>
          </Card>
          <RulesBlock detail={detail} />
          {detail.fields?.length ? (
            <Card>
              <CardHead title="报名需填写" />
              <div className="card-body tight">
                <div className="kv-list">
                  <div className="kv">
                    <span className="k">游戏 ID</span>
                    <span className="v">必填 · OAuth 同步</span>
                  </div>
                  {detail.fields.map((f) => (
                    <div className="kv" key={f.id}>
                      <span className="k">{f.label}</span>
                      <span className="v">
                        {f.required ? '必填' : '选填'} ·{' '}
                        {f.type === 'textarea'
                          ? '多行文本'
                          : f.type === 'number'
                            ? '数字'
                            : f.type === 'select'
                              ? '单选'
                              : f.type === 'checkbox'
                                ? '勾选'
                                : '文本'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
