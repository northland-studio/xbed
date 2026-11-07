import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, toList } from '../../lib/api';
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
import { POINT_REASON, label } from '../../lib/labels';
import { fmtDateTime, fmtDelta, fmtNum } from '../../lib/format';
import type { PointTransaction, Season } from '../../types';

const PAGE_SIZE = 20;

export function AdminPointsPage() {
  const { isSuper } = useAuth();
  const act = useAction();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const seasonId = searchParams.get('seasonId') ?? '';
  const userId = searchParams.get('userId') ?? '';
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [form, setForm] = useState({ seasonId: '', userId: '', delta: 0, reason: '' });
  const [busy, setBusy] = useState(false);

  const { data: seasons } = useQuery({
    queryKey: ['admin', 'seasons', 'all'],
    queryFn: async () => toList<Season>(await get('/admin/seasons', { page: 1, pageSize: 100 })),
  });

  const { data, isLoading, error, refetch } = useList<PointTransaction>(
    ['admin', 'points', seasonId, userId, page],
    '/admin/points',
    { seasonId: seasonId || undefined, userId: userId || undefined, page, pageSize: PAGE_SIZE },
  );

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const adjust = async () => {
    if (!form.seasonId || !form.userId || !form.delta || !form.reason.trim()) return;
    setBusy(true);
    const ok = await act(
      () =>
        post('/admin/points/adjust', {
          seasonId: Number(form.seasonId),
          userId: Number(form.userId),
          delta: Number(form.delta),
          reason: form.reason.trim(),
        }),
      {
        success: '积分调整已生效（已写入审计）',
        invalidate: [['admin', 'points'], ['admin', 'leaderboard'], ['leaderboard']],
      },
    );
    setBusy(false);
    if (ok) {
      setAdjustOpen(false);
      setForm({ seasonId: '', userId: '', delta: 0, reason: '' });
    }
  };

  const columns: Column<PointTransaction>[] = [
    {
      key: 'user',
      title: '玩家',
      render: (t) => (
        <div>
          <div style={{ color: 'var(--text)' }}>{t.nickname || `用户 ${t.userId}`}</div>
          <div className="dim mono" style={{ fontSize: 11 }}>ID {t.userId}</div>
        </div>
      ),
      mobileLabel: '玩家',
    },
    {
      key: 'season',
      title: '赛季',
      render: (t) => <span className="dim">{t.seasonName || `#${t.seasonId}`}</span>,
      mobile: false,
    },
    {
      key: 'delta',
      title: '积分变化',
      align: 'right',
      render: (t) => (
        <span className="num" style={{ color: t.delta >= 0 ? 'var(--ok)' : 'var(--danger)', fontWeight: 700 }}>
          {fmtDelta(t.delta)}
        </span>
      ),
    },
    {
      key: 'balance',
      title: '变动后',
      align: 'right',
      render: (t) => <span className="num">{t.balanceAfter ?? '—'}</span>,
    },
    {
      key: 'reason',
      title: '原因',
      render: (t) => (
        <div>
          <Badge kind={t.reason === 'admin_adjust' ? 'yellow' : 'gray'}>{label(POINT_REASON, t.reason)}</Badge>
          {t.note ? <div className="dim" style={{ fontSize: 11.5 }}>{t.note}</div> : null}
        </div>
      ),
    },
    {
      key: 'match',
      title: '关联比赛',
      render: (t) =>
        t.matchId ? (
          <Link to={`/admin/matches/${t.matchId}`} className="mono" style={{ color: 'var(--purple-soft)' }}>
            #{t.matchId}
          </Link>
        ) : (
          <span className="dim">—</span>
        ),
      mobile: false,
    },
    { key: 'createdAt', title: '时间', align: 'right', render: (t) => <span className="num">{fmtDateTime(t.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHead
        title="积分管理"
        desc="积分流水全量可追溯。手动调整仅限超级管理员，必须填写理由并写入审计日志。积分结算由赛果审核自动完成，不在此处重复结算。"
        actions={
          isSuper ? (
            <Btn variant="primary" size="sm" onClick={() => setAdjustOpen(true)}>
              手动调整积分
            </Btn>
          ) : (
            <span className="dim" style={{ fontSize: 12 }}>手动调整需超级管理员权限</span>
          )
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
          <input
            className="input"
            placeholder="按用户 ID 过滤"
            value={userId}
            style={{ minWidth: 150 }}
            onChange={(e) => setFilter('userId', e.target.value.replace(/\D/g, ''))}
          />
          <span className="dim" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
            共 <span className="counter">{data?.total ?? 0}</span> 条流水
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
              rowKey={(t) => t.id}
              loading={isLoading}
              emptyText="没有积分流水"
              mobileTitle={(t) => t.nickname || `用户 ${t.userId}`}
              mobileSub={(t) => fmtDelta(t.delta)}
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
        open={adjustOpen}
        title="手动调整积分"
        onClose={() => setAdjustOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setAdjustOpen(false)}>
              取消
            </Btn>
            <Btn
              variant="primary"
              loading={busy}
              disabled={!form.seasonId || !form.userId || !form.delta || !form.reason.trim()}
              onClick={() => void adjust()}
            >
              提交调整
            </Btn>
          </>
        }
      >
        <div className="stack">
          <div className="alert alert-warn" style={{ display: 'flex', gap: 10 }}>
            <span>⚑</span>
            <div>手动调整会直接改变排行榜与段位，属于关键操作，必须填写真实理由，操作会永久写入审计日志。</div>
          </div>
          <div className="form-grid">
            <Field label="赛季" required>
              <select
                className="select"
                value={form.seasonId}
                onChange={(e) => setForm({ ...form, seasonId: e.target.value })}
              >
                <option value="">请选择赛季</option>
                {(seasons?.items ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="用户 ID" required hint="XBed 内部玩家 ID">
              <input
                className="input"
                inputMode="numeric"
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value.replace(/\D/g, '') })}
              />
            </Field>
            <Field label="积分变化" required hint="正数加分，负数扣分">
              <input
                className="input"
                type="number"
                value={form.delta}
                onChange={(e) => setForm({ ...form, delta: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="调整理由" required>
            <textarea className="textarea" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <div className="dim" style={{ fontSize: 12 }}>
            预计变化：<span className="num">{fmtNum(form.delta)}</span> 分（最终余额以服务端计算为准）
          </div>
        </div>
      </Modal>
    </div>
  );
}
