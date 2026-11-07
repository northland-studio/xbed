import { useState } from 'react';
import { post } from '../../lib/api';
import { useAction, useList } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import {
  Badge,
  Btn,
  Card,
  DataTable,
  ErrorState,
  Field,
  Modal,
  PageHead,
  Pagination,
  type Column,
} from '../../components/ui';
import { fmtDateTime, fmtNum } from '../../lib/format';
import type { Team } from '../../types';

const PAGE_SIZE = 20;

export function AdminTeamsPage() {
  const { isSuper } = useAuth();
  const act = useAction();
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Team | null>(null);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useList<Team>(['admin', 'teams', page], '/admin/teams', {
    page,
    pageSize: PAGE_SIZE,
  });

  const transfer = async () => {
    if (!target || !userId.trim()) return;
    setBusy(true);
    const ok = await act(
      () => post(`/admin/teams/${target.id}/transfer`, { userId: Number(userId) }),
      { success: '队长已转让', invalidate: [['admin', 'teams']] },
    );
    setBusy(false);
    if (ok) {
      setTarget(null);
      setUserId('');
    }
  };

  const columns: Column<Team>[] = [
    {
      key: 'name',
      title: '战队',
      render: (t) => (
        <div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{t.name}</div>
          <div className="dim truncate" style={{ fontSize: 11.5, maxWidth: 260 }}>
            {t.intro || '暂无简介'}
          </div>
        </div>
      ),
      mobileLabel: '战队',
    },
    {
      key: 'captain',
      title: '队长',
      render: (t) => <span className="mono">ID {t.captainId}</span>,
    },
    {
      key: 'members',
      title: '成员数',
      align: 'right',
      render: (t) => <span className="num">{fmtNum(t.members?.length ?? t.membersCount)}</span>,
    },
    {
      key: 'state',
      title: '状态',
      render: (t) => (t.state === 'archived' ? <Badge kind="gray">已归档</Badge> : <Badge kind="green">正常</Badge>),
      mobile: false,
    },
    { key: 'createdAt', title: '创建时间', align: 'right', render: (t) => <span className="num">{fmtDateTime(t.createdAt)}</span>, mobile: false },
    {
      key: 'actions',
      title: '',
      align: 'right',
      mobile: false,
      render: (t) =>
        isSuper ? (
          <Btn
            size="sm"
            variant="outline"
            onClick={() => {
              setTarget(t);
              setUserId('');
            }}
          >
            队长转让
          </Btn>
        ) : (
          <span className="dim">只读</span>
        ),
    },
  ];

  return (
    <div>
      <PageHead
        title="战队管理"
        desc="S1 战队为私有基础功能，不参与赛事积分与比赛关联。队长不能自行转让或解散，需超级管理员介入治理。"
      />

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card>
          <div style={{ padding: 4 }}>
            <DataTable
              columns={columns}
              items={data?.items ?? []}
              rowKey={(t) => t.id}
              loading={isLoading}
              emptyText="暂无战队"
              mobileTitle={(t) => t.name}
              mobileSub={(t) => `成员 ${t.membersCount ?? 0}`}
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
        open={!!target}
        title={`转让队长 · ${target?.name ?? ''}`}
        onClose={() => setTarget(null)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setTarget(null)}>
              取消
            </Btn>
            <Btn variant="primary" loading={busy} disabled={!userId.trim()} onClick={() => void transfer()}>
              确认转让
            </Btn>
          </>
        }
      >
        <div className="stack">
          <div className="alert alert-warn" style={{ display: 'flex', gap: 10 }}>
            <span>⚑</span>
            <div>转让后原队长降为普通成员，操作写入审计日志。请确认目标用户已在该战队成员列表中。</div>
          </div>
          <Field label="新队长用户 ID" required>
            <input
              className="input"
              inputMode="numeric"
              value={userId}
              onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <div className="dim" style={{ fontSize: 12 }}>
            当前队长 ID：{target?.captainId} · 成员数：{target?.membersCount ?? 0}
          </div>
        </div>
      </Modal>
    </div>
  );
}
