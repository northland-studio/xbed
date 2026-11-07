import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, toList } from '../../lib/api';
import { useAction, useList } from '../../lib/admin';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  DataTable,
  ErrorState,
  Modal,
  PageHead,
  Pagination,
  Field,
  type Column,
} from '../../components/ui';
import { REGISTRATION_STATE_OPTIONS } from '../../lib/labels';
import { fmtDateTime } from '../../lib/format';
import type { Registration, Season } from '../../types';

const PAGE_SIZE = 20;

export function AdminRegistrationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const seasonId = searchParams.get('seasonId') ?? '';
  const state = searchParams.get('state') ?? '';
  const act = useAction();
  const [revokeTarget, setRevokeTarget] = useState<Registration | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: seasons } = useQuery({
    queryKey: ['admin', 'seasons', 'all'],
    queryFn: async () => toList<Season>(await get('/admin/seasons', { page: 1, pageSize: 100 })),
  });

  const { data, isLoading, error, refetch } = useList<Registration>(
    ['admin', 'registrations', seasonId, state, page],
    '/admin/registrations',
    { seasonId: seasonId || undefined, state: state || undefined, page, pageSize: PAGE_SIZE },
  );

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    if (!reason.trim()) return;
    setBusy(true);
    const ok = await act(
      () => post(`/admin/registrations/${revokeTarget.id}/revoke`, { reason: reason.trim() }),
      { success: '已取消该玩家本赛季参赛资格', invalidate: [['admin', 'registrations']] },
    );
    setBusy(false);
    if (ok) {
      setRevokeTarget(null);
      setReason('');
    }
  };

  const columns: Column<Registration>[] = [
    {
      key: 'user',
      title: '玩家',
      render: (r) => (
        <div className="row" style={{ gap: 10 }}>
          <Avatar src={r.avatar} name={r.nickname} size="sm" />
          <div className="avatar-name">
            <span className="n">{r.nickname || r.username || `用户 ${r.userId}`}</span>
            <span className="s">{r.gameId || '—'}</span>
          </div>
        </div>
      ),
      mobileLabel: '玩家',
    },
    {
      key: 'season',
      title: '赛季',
      render: (r) => <Link to={`/admin/seasons/${r.seasonId}`} style={{ color: 'var(--purple-soft)' }}>{r.seasonName || `#${r.seasonId}`}</Link>,
    },
    {
      key: 'state',
      title: '状态',
      render: (r) =>
        r.state === 'revoked' ? <Badge kind="red">已取消资格</Badge> : <Badge kind="green">有效</Badge>,
    },
    {
      key: 'custom',
      title: '自定义字段',
      render: (r) => {
        const entries = Object.entries(r.customData ?? {});
        if (!entries.length) return <span className="dim">—</span>;
        return (
          <div className="dim" style={{ fontSize: 11.5, maxWidth: 320 }}>
            {entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
          </div>
        );
      },
      mobile: false,
    },
    { key: 'createdAt', title: '报名时间', align: 'right', render: (r) => <span className="num">{fmtDateTime(r.createdAt)}</span> },
    {
      key: 'actions',
      title: '',
      align: 'right',
      mobile: false,
      render: (r) =>
        r.state === 'revoked' ? (
          <span className="dim" style={{ fontSize: 12 }}>
            {r.revokeReason || '已取消'}
          </span>
        ) : (
          <Btn size="sm" variant="danger" onClick={() => setRevokeTarget(r)}>
            取消资格
          </Btn>
        ),
    },
  ];

  return (
    <div>
      <PageHead
        title="报名管理"
        desc="查看与处理赛季报名。报名符合资格后自动通过，管理员可对违规情况取消参赛资格并填写理由（写入审计）。"
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
            {REGISTRATION_STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.text}
              </option>
            ))}
          </select>
          <span className="dim" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
            共 <span className="counter">{data?.total ?? 0}</span> 条报名
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
              rowKey={(r) => r.id}
              loading={isLoading}
              emptyText="没有符合条件的报名"
              mobileTitle={(r) => r.nickname || `用户 ${r.userId}`}
              mobileSub={(r) => r.seasonName || ''}
            />
          </div>
          {data && data.total > PAGE_SIZE ? (
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={data.page || page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
            </div>
          ) : null}
        </Card>
      )}

      <Modal
        open={!!revokeTarget}
        title="取消参赛资格"
        onClose={() => setRevokeTarget(null)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRevokeTarget(null)}>
              取消
            </Btn>
            <Btn variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => void revoke()}>
              确认取消资格
            </Btn>
          </>
        }
      >
        <div className="stack">
          <p className="muted" style={{ fontSize: 13 }}>
            即将取消 <strong>{revokeTarget?.nickname || revokeTarget?.gameId || '该玩家'}</strong> 在
            「{revokeTarget?.seasonName || '该赛季'}」的参赛资格。已产生的比赛与积分记录不会被删除，取消操作会写入审计日志。
          </p>
          <Field label="取消理由" required hint="将通知玩家，并记录到审计日志">
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
