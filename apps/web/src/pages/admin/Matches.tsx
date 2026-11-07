import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, toList } from '../../lib/api';
import { useList } from '../../lib/admin';
import {
  Badge,
  Btn,
  Card,
  DataTable,
  ErrorState,
  PageHead,
  Pagination,
  type Column,
} from '../../components/ui';
import { MATCH_STATE, MATCH_STATE_BADGE, MATCH_STATE_OPTIONS, label, badge } from '../../lib/labels';
import { fmtDateTime, matchDuration } from '../../lib/format';
import type { Match, Season } from '../../types';

const PAGE_SIZE = 20;

export function AdminMatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const seasonId = searchParams.get('seasonId') ?? '';
  const state = searchParams.get('state') ?? '';

  const { data: seasons } = useQuery({
    queryKey: ['admin', 'seasons', 'all'],
    queryFn: async () => toList<Season>(await get('/admin/seasons', { page: 1, pageSize: 100 })),
  });

  const { data, isLoading, error, refetch } = useList<Match>(
    ['admin', 'matches', seasonId, state, page],
    '/admin/matches',
    { seasonId: seasonId || undefined, state: state || undefined, page, pageSize: PAGE_SIZE },
  );

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const columns: Column<Match>[] = [
    {
      key: 'id',
      title: '比赛',
      width: '100px',
      render: (m) => (
        <Link to={`/admin/matches/${m.id}`} className="mono" style={{ color: '#a78bfa' }}>
          #{m.id}
        </Link>
      ),
    },
    {
      key: 'arena',
      title: '地图 / 模式',
      render: (m) => (
        <div>
          <div style={{ color: 'var(--text)' }}>{m.arenaDisplay || m.arena || '未知地图'}</div>
          <div className="dim" style={{ fontSize: 11.5 }}>{m.mode || '—'}</div>
        </div>
      ),
    },
    {
      key: 'season',
      title: '赛季',
      render: (m) => <span className="dim">{m.season?.name || m.seasonName || '—'}</span>,
      mobile: false,
    },
    {
      key: 'state',
      title: '状态',
      render: (m) => <Badge kind={badge(MATCH_STATE_BADGE, m.state)}>{label(MATCH_STATE, m.state)}</Badge>,
    },
    {
      key: 'players',
      title: '玩家',
      align: 'right',
      render: (m) => <span className="num">{m.playerCount ?? m.players?.length ?? '—'}</span>,
      mobile: false,
    },
    {
      key: 'duration',
      title: '时长',
      align: 'right',
      render: (m) => <span className="num">{matchDuration(m.startedAt, m.endedAt)}</span>,
      mobile: false,
    },
    {
      key: 'submittedAt',
      title: '上报时间',
      align: 'right',
      render: (m) => <span className="num">{fmtDateTime(m.submittedAt || m.createdAt)}</span>,
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      mobile: false,
      render: (m) => (
        <Link to={`/admin/matches/${m.id}`} className="btn btn-outline btn-sm">
          审核
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="比赛管理"
        desc="服务器上报的比赛进入待审核队列。审核通过后才会生成正式赛果、结算积分与更新排行榜。"
        actions={
          <Link to="/admin/matches?state=pending" className="btn btn-primary btn-sm">
            待审核队列
          </Link>
        }
      />

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div className="filter-bar">
          <select className="select" value={seasonId} onChange={(e) => setFilter('seasonId', e.target.value)}>
            <option value="">全部赛季</option>
            {(seasons?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="select" value={state} onChange={(e) => setFilter('state', e.target.value)}>
            <option value="">全部状态</option>
            {MATCH_STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.text}
              </option>
            ))}
          </select>
          <span className="dim" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
            共 <span className="counter">{data?.total ?? 0}</span> 场比赛
          </span>
        </div>
      </Card>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card>
          <div style={{ padding: 4 }}>
            <DataTable
              columns={columns}
              items={data?.items ?? []}
              rowKey={(m) => m.id}
              loading={isLoading}
              emptyText="没有符合条件的比赛"
              mobileTitle={(m) => `#${m.id} · ${m.arenaDisplay || m.arena || '未知地图'}`}
              mobileSub={(m) => label(MATCH_STATE, m.state)}
            />
          </div>
          {data && data.total > PAGE_SIZE ? (
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={data.page || page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
            </div>
          ) : null}
        </Card>
      )}
      <Btn variant="ghost" size="sm" className="mt-16" onClick={() => void refetch()}>
        刷新列表
      </Btn>
    </div>
  );
}
