import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { del, get, patch, toList } from '../../lib/api';
import { useAction } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import {
  Badge,
  Btn,
  Card,
  CardHead,
  DataTable,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
  Pagination,
  RankMedal,
  UserCell,
  type Column,
} from '../../components/ui';
import { fmtRate } from '../../lib/format';
import type { LeaderboardEntry, RankTier, Season } from '../../types';

const PAGE_SIZE = 20;

interface TierForm {
  id?: number;
  name: string;
  minPoints: number;
  color: string;
  icon: string;
  sortOrder: number;
}

const EMPTY_TIER: TierForm = { name: '', minPoints: 0, color: '#8b5cf6', icon: '', sortOrder: 0 };

export function AdminLeaderboardPage() {
  const { isSuper } = useAuth();
  const act = useAction();
  const [page, setPage] = useState(1);
  const [seasonId, setSeasonId] = useState('');
  const [kind, setKind] = useState<'season' | 'lifetime'>('season');
  const [tierOpen, setTierOpen] = useState(false);
  const [tierForm, setTierForm] = useState<TierForm>(EMPTY_TIER);
  const [tierBusy, setTierBusy] = useState(false);

  const { data: seasons } = useQuery({
    queryKey: ['admin', 'seasons', 'all'],
    queryFn: async () => toList<Season>(await get('/admin/seasons', { page: 1, pageSize: 100 })),
  });

  const { data: board, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'leaderboard', seasonId, page],
    queryFn: async () =>
      toList<LeaderboardEntry>(
        await get('/admin/leaderboard', { seasonId: seasonId || undefined, page, pageSize: PAGE_SIZE }),
      ),
  });

  const { data: tiers, refetch: refetchTiers } = useQuery({
    queryKey: ['admin', 'rank-tiers', kind, seasonId],
    queryFn: async () => {
      const res = await get<{ items?: RankTier[] } | RankTier[]>('/admin/rank-tiers', {
        kind,
        seasonId: seasonId || undefined,
      });
      return Array.isArray(res) ? res : res.items ?? [];
    },
  });

  useEffect(() => {
    setPage(1);
  }, [seasonId]);

  const openTier = (t?: RankTier) => {
    if (t) {
      setTierForm({
        id: t.id,
        name: t.name,
        minPoints: t.minPoints,
        color: t.color || '#8b5cf6',
        icon: t.icon ?? '',
        sortOrder: t.sortOrder ?? 0,
      });
    } else {
      setTierForm({ ...EMPTY_TIER, sortOrder: (tiers?.length ?? 0) * 10 });
    }
    setTierOpen(true);
  };

  const saveTier = async () => {
    if (!tierForm.name.trim()) return;
    setTierBusy(true);
    const ok = await act(
      () =>
        patch('/admin/rank-tiers', {
          id: tierForm.id,
          kind,
          seasonId: kind === 'season' && seasonId ? Number(seasonId) : undefined,
          name: tierForm.name.trim(),
          minPoints: Number(tierForm.minPoints),
          color: tierForm.color,
          icon: tierForm.icon || undefined,
          sortOrder: Number(tierForm.sortOrder),
        }),
      { success: '段位配置已保存', invalidate: [['admin', 'rank-tiers']] },
    );
    setTierBusy(false);
    if (ok) {
      setTierOpen(false);
      void refetchTiers();
    }
  };

  const deleteTier = async (t: RankTier) => {
    if (!window.confirm(`确认删除段位「${t.name}」？历史段位记录会保留。`)) return;
    const ok = await act(() => del(`/admin/rank-tiers/${t.id}`), {
      success: '段位已删除',
      invalidate: [['admin', 'rank-tiers']],
    });
    if (ok) void refetchTiers();
  };

  const columns: Column<LeaderboardEntry>[] = [
    {
      key: 'rank',
      title: '排名',
      width: '64px',
      render: (e, i) => <RankMedal rank={e.rank ?? (page - 1) * PAGE_SIZE + i + 1} />,
    },
    {
      key: 'user',
      title: '玩家',
      render: (e) => (
        <UserCell name={e.nickname} sub={e.gameId || `ID ${e.userId}`} avatar={e.avatar} to={`/players/${e.userId}`} />
      ),
    },
    { key: 'points', title: '积分', align: 'right', render: (e) => <span className="num">{e.points ?? 0}</span> },
    { key: 'matches', title: '场次', align: 'right', render: (e) => <span className="num">{e.matches ?? 0}</span>, mobile: false },
    { key: 'winRate', title: '胜率', align: 'right', render: (e) => <span className="num">{fmtRate(e.winRate)}</span> },
    { key: 'kills', title: '击杀', align: 'right', render: (e) => <span className="num">{e.kills ?? 0}</span> },
    {
      key: 'tier',
      title: '段位',
      render: (e) =>
        e.tier?.name ? (
          <span className="tier-chip" style={{ color: e.tier.color || '#8b5cf6' }}>
            <span className="tier-dot" />
            {e.tier.name}
          </span>
        ) : (
          <span className="dim">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHead
        title="排行榜 / 段位配置"
        desc="后台排行榜与前台共用同一数据源。段位由积分区间决定，配置修改保留历史版本，历史段位记录不受影响。"
      />

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div className="filter-bar">
          <select
            className="select"
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
          >
            <option value="">全部 / 当前赛季</option>
            {(seasons?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="dim" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
            共 <span className="counter">{board?.total ?? 0}</span> 名玩家
          </span>
        </div>
      </Card>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card className="mb-16">
          <div style={{ padding: 4 }}>
            <DataTable
              columns={columns}
              items={board?.items ?? []}
              rowKey={(e) => e.userId}
              loading={isLoading}
              emptyText="排行榜暂无数据"
              mobileTitle={(e) => e.nickname || `用户 ${e.userId}`}
              mobileSub={(e) => `${e.points ?? 0} 分`}
            />
          </div>
          {board && board.total > PAGE_SIZE ? (
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={board.page || page} pageSize={board.pageSize || PAGE_SIZE} total={board.total} onChange={setPage} />
            </div>
          ) : null}
        </Card>
      )}

      <Card>
        <CardHead
          title="段位配置"
          extra={
            <>
              <select className="select input-sm" style={{ width: 130 }} value={kind} onChange={(e) => setKind(e.target.value as 'season' | 'lifetime')}>
                <option value="season">赛季段位</option>
                <option value="lifetime">永久段位</option>
              </select>
              {isSuper ? (
                <Btn size="sm" variant="outline" onClick={() => openTier()}>
                  新增段位
                </Btn>
              ) : (
                <span className="dim" style={{ fontSize: 12 }}>
                  配置需超管
                </span>
              )}
            </>
          }
        />
        {!tiers?.length ? (
          <Empty text="暂无段位配置" extra="默认规则：青铜 0-29 / 白银 30-59 / 黄金 60-89 / 铂金 90-119 / 钻石 120-159 / 大师 160-199 / 王者 200+" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>段位</th>
                  <th>积分门槛</th>
                  <th>颜色</th>
                  <th>排序</th>
                  <th className="right">操作</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="tier-chip" style={{ color: t.color || '#8b5cf6' }}>
                        <span className="tier-dot" />
                        {t.name}
                      </span>
                    </td>
                    <td className="num">≥ {t.minPoints}</td>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: t.color || '#8b5cf6', display: 'inline-block' }} />
                        <span className="mono dim" style={{ fontSize: 11 }}>{t.color || '—'}</span>
                      </span>
                    </td>
                    <td className="num">{t.sortOrder ?? 0}</td>
                    <td className="right">
                      {isSuper ? (
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          <Btn size="sm" variant="ghost" onClick={() => openTier(t)}>
                            编辑
                          </Btn>
                          <Btn size="sm" variant="danger" onClick={() => void deleteTier(t)}>
                            删除
                          </Btn>
                        </div>
                      ) : (
                        <span className="dim">只读</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-body tight">
          <div className="dim" style={{ fontSize: 11.5 }}>
            段位规则：积分区间左闭右开，由高到低匹配；修改配置不会改写历史 rank_history 记录。
          </div>
        </div>
      </Card>

      <Modal
        open={tierOpen}
        title={tierForm.id ? '编辑段位' : '新增段位'}
        onClose={() => setTierOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setTierOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" loading={tierBusy} onClick={() => void saveTier()}>
              保存
            </Btn>
          </>
        }
      >
        <div className="form-grid">
          <Field label="段位名称" required>
            <input className="input" value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} />
          </Field>
          <Field label="积分门槛" required hint="达到该积分即进入此段位">
            <input
              className="input"
              type="number"
              value={tierForm.minPoints}
              onChange={(e) => setTierForm({ ...tierForm, minPoints: Number(e.target.value) })}
            />
          </Field>
          <Field label="颜色">
            <input className="input" value={tierForm.color} onChange={(e) => setTierForm({ ...tierForm, color: e.target.value })} />
          </Field>
          <Field label="排序">
            <input
              className="input"
              type="number"
              value={tierForm.sortOrder}
              onChange={(e) => setTierForm({ ...tierForm, sortOrder: Number(e.target.value) })}
            />
          </Field>
          <Field label="图标（可选）">
            <input className="input" value={tierForm.icon} onChange={(e) => setTierForm({ ...tierForm, icon: e.target.value })} />
          </Field>
        </div>
        <div className="mt-12">
          预览：<Badge kind="purple">{tierForm.name || '段位名称'}</Badge> · ≥ {tierForm.minPoints} 分
        </div>
      </Modal>

      {isLoading ? <Loading /> : null}
    </div>
  );
}
