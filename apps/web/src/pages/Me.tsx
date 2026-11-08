import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '../lib/api';
import { RequireLogin, useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  CardHead,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
  StatCard,
  TierChip,
} from '../components/ui';
import { MatchCard } from '../components/cards';
import { EmailVerifyBox } from '../components/EmailVerify';
import { AreaTrendChart } from '../components/Charts';
import { fmtDate, fmtDateTime, fmtNum, fmtRate } from '../lib/format';
import type { Paginated, PlayerProfile, Registration } from '../types';

function MeInner() {
  const { user, isAdmin, refetch: refetchAuth } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [gameId, setGameId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => get<PlayerProfile>('/me/profile'),
  });

  const { data: regPage } = useQuery({
    queryKey: ['me', 'registrations'],
    queryFn: async () => {
      const res = await get<Paginated<Registration>>('/me/registrations');
      const items = Array.isArray(res) ? (res as unknown as Registration[]) : res.items;
      return items ?? [];
    },
  });

  const profileUser = data?.user ?? user;
  const emailVerified = data?.emailVerified ?? profileUser?.emailVerified ?? false;
  const email = data?.email ?? profileUser?.email ?? null;
  const stats = data?.currentSeason ?? data?.stats ?? {};
  const lifetime = data?.lifetime ?? {};
  const trend = (data?.trend ?? []).map((t) => ({ ...t, date: t.date ? fmtDate(t.date) : '' }));

  const saveGameId = async () => {
    if (!gameId.trim()) {
      toast.error('游戏 ID 不能为空');
      return;
    }
    setSaving(true);
    try {
      await patch('/me/profile', { gameId: gameId.trim(), game_id: gameId.trim() });
      toast.success('游戏 ID 已更新');
      setEditOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['me', 'profile'] }),
        qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
        refetchAuth(),
      ]);
      void refetch();
    } catch {
      /* 全局 toast */
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container">
        <Loading text="正在加载个人中心…" />
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

  return (
    <div className="container">
      <PageHead
        title="个人中心"
        desc="玄剑资料由官网管理，XBed 内不可修改（游戏 ID 在未报名赛季时允许修正）。邮箱需单独验证后方可报名参赛。"
        actions={
          <>
            <Link to="/me/notifications" className="btn btn-outline btn-sm">
              通知中心
            </Link>
            <Link to="/me/appeals" className="btn btn-ghost btn-sm">
              我的申诉
            </Link>
            {isAdmin ? (
              <Link to="/admin" className="btn btn-ghost btn-sm">
                管理后台
              </Link>
            ) : null}
          </>
        }
      />

      <div className="profile-hero mb-16">
        <div className="profile-head">
          <Avatar src={profileUser?.avatar} name={profileUser?.nickname || profileUser?.username} size="xl" />
          <div className="flex-1">
            <div className="profile-name">{profileUser?.nickname || profileUser?.username || '未命名玩家'}</div>
            <div className="row row-wrap mt-8" style={{ gap: 8 }}>
              {profileUser?.username ? <span className="tag">@{profileUser.username}</span> : null}
              <span className="tag">玄剑 Lv.{profileUser?.level ?? 0}</span>
              {profileUser?.title ? <span className="tag">{profileUser.title}</span> : null}
              {emailVerified ? <Badge kind="green">邮箱已验证</Badge> : <Badge kind="yellow">邮箱未验证</Badge>}
              {profileUser?.gameId ? <span className="tag">游戏 ID：{profileUser.gameId}</span> : null}
            </div>
            <div className="profile-tags">
              <span className="dim" style={{ fontSize: 12 }}>当前赛季段位</span>
              <TierChip tier={stats.tier} />
              <span className="dim" style={{ fontSize: 12, marginLeft: 10 }}>永久历史段位</span>
              <TierChip tier={data?.lifetimeTier} />
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
              <div className="si-k">场次</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-4 mb-16">
        <StatCard label="赛季胜 / 负 / 平" value={`${stats.wins ?? 0} / ${stats.losses ?? 0} / ${stats.draws ?? 0}`} hint="当前赛季" accent />
        <StatCard label="总击杀" value={fmtNum(stats.kills ?? 0)} hint={`死亡 ${fmtNum(stats.deaths ?? 0)}`} />
        <StatCard label="最佳连胜" value={fmtNum(stats.bestStreak ?? data?.records?.bestStreak ?? 0)} hint="当前赛季" />
        <StatCard label="最高单场击杀" value={fmtNum(stats.maxKills ?? data?.records?.maxKills ?? 0)} hint="当前赛季" />
      </div>

      <div className="grid grid-side">
        <div className="stack">
          <Card>
            <CardHead
              title="我的报名"
              extra={<span className="dim" style={{ fontSize: 12 }}>报名通过后自动获得该赛季参赛资格</span>}
            />
            {!regPage?.length ? (
              <Empty text="还没有报名任何赛季" extra="前往赛事中心选择开放报名的赛季。" />
            ) : (
              <div className="table-wrap responsive-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>赛季</th>
                      <th>游戏 ID</th>
                      <th>状态</th>
                      <th>报名时间</th>
                      <th className="right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regPage.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/seasons/${r.seasonId}`} style={{ color: 'var(--purple-soft)' }}>
                            {r.seasonName || r.season?.name || `赛季 ${r.seasonId}`}
                          </Link>
                        </td>
                        <td className="mono">{r.gameId || '—'}</td>
                        <td>
                          {r.state === 'revoked' ? <Badge kind="red">已取消资格</Badge> : <Badge kind="green">有效</Badge>}
                          {r.revokeReason ? <div className="dim" style={{ fontSize: 11 }}>{r.revokeReason}</div> : null}
                        </td>
                        <td className="num">{fmtDateTime(r.createdAt)}</td>
                        <td className="right">
                          <Link to={`/seasons/${r.seasonId}`} className="btn btn-ghost btn-sm">
                            赛季
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="chart-card">
            <CardHead title="竞技趋势" extra={<span className="dim" style={{ fontSize: 12 }}>基于已审核通过的比赛</span>} />
            <div className="card-body">
              <AreaTrendChart
                data={trend}
                xKey="date"
                series={[
                  { key: 'points', label: '积分', color: '#8b5cf6' },
                  { key: 'kills', label: '击杀', color: '#22d3ee' },
                  { key: 'wins', label: '胜场', color: '#fbbf24' },
                ]}
                height={250}
              />
            </div>
          </Card>

          <Card>
            <CardHead
              title="我的比赛与证据"
              extra={
                <span className="dim" style={{ fontSize: 12 }}>
                  比赛结束后 1 小时内需提交 latest.log 与回放
                </span>
              }
            />
            {!data?.recentMatches?.length ? (
              <Empty text="暂无比赛记录" extra="参加正式比赛后会出现在这里；赛果未公布时也可进入比赛详情提交证据。" />
            ) : (
              <div>
                {data.recentMatches.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="邮箱验证" />
            <div className="card-body tight">
              <EmailVerifyBox
                currentEmail={email}
                verified={emailVerified}
                onDone={() => {
                  void refetch();
                  void qc.invalidateQueries({ queryKey: ['me', 'profile'] });
                }}
              />
            </div>
          </Card>

          <Card>
            <CardHead
              title="游戏资料"
              extra={
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setGameId(profileUser?.gameId ?? '');
                    setEditOpen(true);
                  }}
                >
                  修改游戏 ID
                </Btn>
              }
            />
            <div className="card-body tight">
              <div className="kv-list">
                <div className="kv">
                  <span className="k">玄剑用户名</span>
                  <span className="v">{profileUser?.username || '—'}</span>
                </div>
                <div className="kv">
                  <span className="k">昵称</span>
                  <span className="v">{profileUser?.nickname || '—'}</span>
                </div>
                <div className="kv">
                  <span className="k">游戏 ID</span>
                  <span className="v mono">{profileUser?.gameId || '未设置'}</span>
                </div>
                <div className="kv">
                  <span className="k">玄剑等级</span>
                  <span className="v">Lv.{profileUser?.level ?? 0}</span>
                </div>
                <div className="kv">
                  <span className="k">公会称号</span>
                  <span className="v">{profileUser?.title || '—'}</span>
                </div>
                <div className="kv">
                  <span className="k">贡献点（只读）</span>
                  <span className="v num">{fmtNum(Math.round(profileUser?.contribution ?? 0))}</span>
                </div>
                <div className="kv">
                  <span className="k">邮箱</span>
                  <span className="v">{email || '未填写'}</span>
                </div>
              </div>
              <p className="dim mt-12" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                用户名、昵称、头像、等级、称号、贡献点由玄剑官网管理，XBed 不允许自行修改。
                游戏 ID 在未报名赛季时允许修改，以免影响赛果绑定。
              </p>
            </div>
          </Card>

          <Card>
            <CardHead title="快捷入口" />
            <div className="card-body tight">
              <div className="stack-sm">
                <Link to="/me/notifications" className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between' }}>
                  通知中心 <span className="dim">未读 / 全部</span>
                </Link>
                <Link to="/me/teams" className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between' }}>
                  我的战队 <span className="dim">创建 / 邀请 / 成员</span>
                </Link>
                <Link to="/me/appeals" className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between' }}>
                  我的申诉 <span className="dim">赛果争议</span>
                </Link>
                <Link to="/leaderboard" className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between' }}>
                  排行榜 <span className="dim">赛季排名</span>
                </Link>
              </div>
            </div>
          </Card>

          {data?.rankHistory?.length ? (
            <Card>
              <CardHead title="段位变化" />
              <div className="card-body tight">
                <div className="timeline">
                  {data.rankHistory.slice(0, 6).map((h) => (
                    <div className="timeline-item" key={h.id}>
                      <div className="timeline-time">{fmtDate(h.createdAt)}</div>
                      <div className="timeline-text">
                        {h.fromTier ? `${h.fromTier} → ` : ''}
                        <span style={{ color: 'var(--purple-soft)' }}>{h.toTier}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={editOpen}
        title="修改游戏 ID"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" loading={saving} onClick={() => void saveGameId()}>
              保存
            </Btn>
          </>
        }
      >
        <div className="stack">
          <Field label="Minecraft 游戏 ID" required hint="仅允许在未报名任何进行中/开放报名赛季时修改，修改后需与服务器上报数据一致">
            <input className="input" value={gameId} onChange={(e) => setGameId(e.target.value)} placeholder="输入游戏 ID" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

export function MePage() {
  return (
    <RequireLogin>
      <MeInner />
    </RequireLogin>
  );
}
