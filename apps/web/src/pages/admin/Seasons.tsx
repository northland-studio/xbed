import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { SEASON_STATE, SEASON_STATE_BADGE, SEASON_STATE_OPTIONS, label, badge } from '../../lib/labels';
import { fmtRange, fromInput } from '../../lib/format';
import type { Season } from '../../types';

const PAGE_SIZE = 20;

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  startAt: '',
  endAt: '',
  initialPoints: 60,
  minPoints: 0,
  winPoints: 5,
  lossPoints: -5,
  drawPoints: 0,
  registrationOpen: true,
};

export function AdminSeasonsPage() {
  const { isSuper } = useAuth();
  const act = useAction();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useList<Season>(
    ['admin', 'seasons', page],
    '/admin/seasons',
    { page, pageSize: PAGE_SIZE },
  );

  const { data: publicSeasons } = useQuery({
    queryKey: ['seasons', 'list'],
    queryFn: async () => toList<Season>(await get('/seasons')).items,
    staleTime: 60_000,
  });

  const create = async () => {
    if (!form.name.trim() || !form.code.trim()) return;
    setBusy(true);
    const ok = await act(
      () =>
        post('/admin/seasons', {
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim(),
          startAt: fromInput(form.startAt),
          endAt: fromInput(form.endAt),
          initialPoints: Number(form.initialPoints),
          minPoints: Number(form.minPoints),
          winPoints: Number(form.winPoints),
          lossPoints: Number(form.lossPoints),
          drawPoints: Number(form.drawPoints),
          registrationOpen: form.registrationOpen,
        }),
      { success: '赛季已创建', invalidate: [['admin', 'seasons'], ['seasons', 'list']] },
    );
    setBusy(false);
    if (ok) {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    }
  };

  const transition = async (season: Season, state: string) => {
    if (!state) return;
    if (state === 'sealed' && !window.confirm('封存赛季会冻结最终积分与排名，之后不允许常规成绩修改。确认封存？')) return;
    await act(() => post(`/admin/seasons/${season.id}/state`, { state }), {
      success: `赛季状态已更新为「${label(SEASON_STATE, state)}」`,
      invalidate: [['admin', 'seasons'], ['seasons', 'list']],
    });
  };

  const columns: Column<Season>[] = [
    {
      key: 'name',
      title: '赛季',
      render: (s) => (
        <div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{s.name}</div>
          <div className="dim mono" style={{ fontSize: 11.5 }}>
            {s.code || `#${s.id}`}
          </div>
        </div>
      ),
      mobileLabel: '赛季',
    },
    {
      key: 'state',
      title: '状态',
      render: (s) => <Badge kind={badge(SEASON_STATE_BADGE, s.state)}>{label(SEASON_STATE, s.state)}</Badge>,
    },
    { key: 'range', title: '赛程', render: (s) => <span className="num">{fmtRange(s.startAt, s.endAt)}</span> },
    {
      key: 'registration',
      title: '报名',
      render: (s) => (
        <span>
          <span className="num">{s.registrationCount ?? 0}</span>
          <span className="dim"> 人</span>
          {s.registrationOpen === false ? <Badge kind="gray">已关闭</Badge> : null}
        </span>
      ),
    },
    {
      key: 'points',
      title: '积分规则',
      render: (s) => (
        <span className="num dim" style={{ fontSize: 12 }}>
          {s.initialPoints ?? 60} 起 / 胜 {s.winPoints ?? 5} 负 {s.lossPoints ?? -5}
        </span>
      ),
      mobile: false,
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      render: (s) => (
        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
          {isSuper ? (
            <select
              className="select input-sm"
              style={{ width: 118, height: 30, fontSize: 12 }}
              value=""
              onChange={(e) => void transition(s, e.target.value)}
            >
              <option value="">状态流转…</option>
              {SEASON_STATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} disabled={o.value === s.state}>
                  {o.text}
                </option>
              ))}
            </select>
          ) : null}
          <Link to={`/admin/seasons/${s.id}`} className="btn btn-ghost btn-sm">
            编辑
          </Link>
        </div>
      ),
      mobile: false,
    },
  ];

  return (
    <div>
      <PageHead
        title="赛季管理"
        desc="创建与配置赛季、流转状态、维护规则版本与自定义报名字段。赛季封存后仅允许有限字段修改。"
        actions={
          <>
            {isSuper ? (
              <Btn variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                创建赛季
              </Btn>
            ) : (
              <span className="dim" style={{ fontSize: 12 }}>
                创建 / 编辑赛季需要超级管理员权限
              </span>
            )}
          </>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card>
          <div style={{ padding: 4 }}>
            <DataTable
              columns={columns}
              items={data?.items ?? []}
              rowKey={(s) => s.id}
              loading={isLoading}
              emptyText="还没有赛季，请先创建"
              mobileTitle={(s) => s.name}
              mobileSub={(s) => label(SEASON_STATE, s.state)}
            />
          </div>
          {data && data.total > PAGE_SIZE ? (
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={data.page || page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
            </div>
          ) : null}
        </Card>
      )}

      <Card className="mt-16">
        <div className="card-body">
          <div className="row-between">
            <div>
              <div style={{ fontWeight: 600 }}>公开赛季列表</div>
              <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                前台只展示 registration / running / sealed / archived 状态的赛季，当前公开 {(publicSeasons ?? []).length} 个。
              </div>
            </div>
            <Link to="/seasons" className="btn btn-ghost btn-sm">
              查看前台
            </Link>
          </div>
        </div>
      </Card>

      <Modal
        open={createOpen}
        title="创建赛季"
        onClose={() => setCreateOpen(false)}
        wide
        footer={
          <>
            <Btn variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" loading={busy} onClick={() => void create()}>
              创建
            </Btn>
          </>
        }
      >
        <div className="form-grid">
          <Field label="赛季编号" required hint="唯一，如 S1">
            <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="赛季名称" required>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="full">
            <Field label="赛季介绍">
              <textarea
                className="textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
          <Field label="开始时间">
            <input
              className="input"
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm({ ...form, startAt: e.target.value })}
            />
          </Field>
          <Field label="结束时间">
            <input
              className="input"
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm({ ...form, endAt: e.target.value })}
            />
          </Field>
          <Field label="初始积分">
            <input
              className="input"
              type="number"
              value={form.initialPoints}
              onChange={(e) => setForm({ ...form, initialPoints: Number(e.target.value) })}
            />
          </Field>
          <Field label="积分下限">
            <input
              className="input"
              type="number"
              value={form.minPoints}
              onChange={(e) => setForm({ ...form, minPoints: Number(e.target.value) })}
            />
          </Field>
          <Field label="胜利积分">
            <input
              className="input"
              type="number"
              value={form.winPoints}
              onChange={(e) => setForm({ ...form, winPoints: Number(e.target.value) })}
            />
          </Field>
          <Field label="失败积分">
            <input
              className="input"
              type="number"
              value={form.lossPoints}
              onChange={(e) => setForm({ ...form, lossPoints: Number(e.target.value) })}
            />
          </Field>
          <Field label="平局积分">
            <input
              className="input"
              type="number"
              value={form.drawPoints}
              onChange={(e) => setForm({ ...form, drawPoints: Number(e.target.value) })}
            />
          </Field>
          <Field label="报名开放">
            <label className="check" style={{ height: 40 }}>
              <input
                type="checkbox"
                checked={form.registrationOpen}
                onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked })}
              />
              创建后立即开放报名
            </label>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
