import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, toList } from '../lib/api';
import { Badge, DataTable, ErrorState, PageHead, Pagination, type Column } from '../components/ui';
import { MATCH_STATE, MATCH_STATE_BADGE, MATCH_STATE_OPTIONS, label, badge } from '../lib/labels';
import { fmtDateTime, matchDuration } from '../lib/format';
import type { Match, Paginated, Season } from '../types';

const PAGE_SIZE = 20;

export function MatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = searchParams.get('state') ?? '';
  const seasonId = searchParams.get('seasonId') ?? '';
  const [page, setPage] = useState(1);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const { data: seasons } = useQuery({
    queryKey: ['seasons', 'list'],
    queryFn: async () => toList<Season>(await get<Paginated<Season>>('/seasons')),
    staleTime: 60_000,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['matches', 'list', state, seasonId, page],
    queryFn: async () =>
      toList<Match>(
        await get<Paginated<Match>>('/matches', {
          page,
          pageSize: PAGE_SIZE,
          state: state || undefined,
          seasonId: seasonId || undefined,
        }),
      ),
  });

  const columns: Column<Match>[] = [
    {
      key: 'id',
      title: '比赛',
      width: '120px',
      render: (m) => (
        <Link to={`/matches/${m.id}`} className="mono" style={{ color: '#a78bfa' }}>
          #{m.id}
        </Link>
      ),
      mobileLabel: '比赛编号',
    },
    {
      key: 'arena',
      title: '地图 / 模式',
      render: (m) => (
        <div>
          <div style={{ color: 'var(--text)' }}>{m.arenaDisplay || m.arena || '未知地图'}</div>
          <div className="dim" style={{ fontSize: 11.5 }}>
            {m.mode || '—'}
          </div>
        </div>
      ),
      mobileLabel: '地图',
    },
    {
      key: 'state',
      title: '状态',
      render: (m) => <Badge kind={badge(MATCH_STATE_BADGE, m.state)}>{label(MATCH_STATE, m.state)}</Badge>,
    },
    {
      key: 'winner',
      title: '结果',
      render: (m) =>
        m.isDraw ? (
          <span className="muted">平局</span>
        ) : m.winnerTeam ? (
          <span style={{ color: 'var(--cyan-soft)' }}>{m.winnerTeam}</span>
        ) : (
          <span className="dim">待定</span>
        ),
    },
    {
      key: 'players',
      title: '玩家数',
      align: 'right',
      render: (m) => <span className="num">{m.playerCount ?? m.players?.length ?? '—'}</span>,
    },
    {
      key: 'duration',
      title: '时长',
      align: 'right',
      render: (m) => <span className="num">{matchDuration(m.startedAt, m.endedAt)}</span>,
    },
    {
      key: 'startedAt',
      title: '开始时间',
      align: 'right',
      render: (m) => <span className="num">{fmtDateTime(m.startedAt || m.submittedAt)}</span>,
      mobileLabel: '时间',
    },
    {
      key: 'season',
      title: '赛季',
      render: (m) => <span className="dim">{m.season?.name || m.seasonName || '—'}</span>,
      mobile: false,
    },
    {
      key: 'action',
      title: '',
      align: 'right',
      mobile: false,
      render: (m) => (
        <Link to={`/matches/${m.id}`} className="btn btn-ghost btn-sm">
          详情
        </Link>
      ),
    },
  ];

  return (
    <div className="container">
      <PageHead
        title="比赛列表"
        desc="仅展示审核通过 / 已裁定的正式比赛。服务器原始数据与证据文件不对普通玩家开放。"
        actions={
          <Link to="/leaderboard" className="btn btn-outline btn-sm">
            查看排行榜
          </Link>
        }
      />

      <div className="card" style={{ padding: 14, marginBottom: 18 }}>
        <div className="filter-bar">
          <select className="select" value={state} onChange={(e) => setFilter('state', e.target.value)}>
            <option value="">全部状态</option>
            {MATCH_STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.text}
              </option>
            ))}
          </select>
          <select className="select" value={seasonId} onChange={(e) => setFilter('seasonId', e.target.value)}>
            <option value="">全部赛季</option>
            {(seasons?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {state || seasonId ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setSearchParams({}, { replace: true })}>
              清除筛选
            </button>
          ) : null}
          <span className="dim" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
            共 <span className="counter">{data?.total ?? 0}</span> 场比赛
          </span>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="card">
          <div style={{ padding: 4 }}>
            <DataTable
              columns={columns}
              items={data?.items ?? []}
              rowKey={(m) => m.id}
              loading={isLoading}
              emptyText="没有符合条件的比赛"
              mobileTitle={(m) => `#${m.id} · ${m.arenaDisplay || m.arena || '未知地图'}`}
              mobileSub={(m) => fmtDateTime(m.startedAt || m.submittedAt)}
            />
          </div>
          {data && data.total > 0 ? (
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={data.page || page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
