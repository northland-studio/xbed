import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post } from '../lib/api';
import { RequireLogin, useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import {
  Alert,
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
} from '../components/ui';
import { fmtDateTime, fromNow } from '../lib/format';
import type { MyTeamsData, TeamInvitation } from '../types';

function TeamsInner() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [intro, setIntro] = useState('');
  const [inviteUserId, setInviteUserId] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['me', 'teams'],
    queryFn: () => get<MyTeamsData>('/me/teams'),
  });

  const { data: invitations } = useQuery({
    queryKey: ['me', 'teams', 'invitations'],
    queryFn: async () => {
      const res = await get<{ items?: TeamInvitation[] } | TeamInvitation[]>('/me/teams/invitations');
      return Array.isArray(res) ? res : res.items ?? [];
    },
  });

  const team = data?.team ?? null;
  const isCaptain = !!team && (team.captainId === user?.id || team.myRole === 'captain');
  const inviteList = (invitations ?? data?.invitations ?? []).filter((i) => i.state !== 'rejected');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['me', 'teams'] });
    void qc.invalidateQueries({ queryKey: ['me', 'teams', 'invitations'] });
    void refetch();
  };

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createTeam = async () => {
    if (!name.trim()) {
      toast.error('请输入战队名称');
      return;
    }
    const ok = await run(() => post('/me/teams', { name: name.trim(), intro: intro.trim() }), '战队创建成功');
    if (ok) {
      setCreateOpen(false);
      setName('');
      setIntro('');
    }
  };

  const saveTeam = async () => {
    if (!name.trim()) {
      toast.error('请输入战队名称');
      return;
    }
    const ok = await run(() => patch('/me/teams', { name: name.trim(), intro: intro.trim() }), '战队资料已更新');
    if (ok) setEditOpen(false);
  };

  const invite = async () => {
    const uid = Number(inviteUserId);
    if (!uid) {
      toast.error('请输入要邀请的用户 ID');
      return;
    }
    const ok = await run(() => post('/me/teams/invite', { userId: uid }), '邀请已发送，对方会收到站内通知');
    if (ok) {
      setInviteOpen(false);
      setInviteUserId('');
    }
  };

  const respond = async (id: number, action: 'accept' | 'reject') => {
    await run(
      () => post(`/me/teams/invitations/${id}/${action}`),
      action === 'accept' ? '已加入战队' : '已拒绝邀请',
    );
  };

  if (isLoading) {
    return (
      <div className="container">
        <Loading text="正在加载战队信息…" />
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
    <div className="container" style={{ maxWidth: 1000 }}>
      <PageHead
        title="我的战队"
        desc="S1 仅提供基础战队管理：创建战队、修改资料、邀请成员、成员管理。战队与比赛队伍暂不关联，也不设公开招募大厅。"
        actions={
          <>
            {!team && data?.createEnabled !== false ? (
              <Btn variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                创建战队
              </Btn>
            ) : null}
            <Link to="/me" className="btn btn-ghost btn-sm">
              返回个人中心
            </Link>
          </>
        }
      />

      {inviteList.length ? (
        <Card className="mb-16">
          <CardHead title="我的邀请" extra={<span className="tag">{inviteList.length} 条待处理</span>} />
          <div>
            {inviteList.map((inv) => (
              <div key={inv.id} className="announce-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    战队「{inv.teamName || inv.teamId}」邀请你加入
                  </div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    邀请人：{inv.inviterNickname || inv.inviterId} · {fromNow(inv.createdAt)} · 有效期至{' '}
                    {fmtDateTime(inv.expiresAt)}
                  </div>
                </div>
                <div className="row">
                  <Btn size="sm" variant="primary" loading={busy} onClick={() => void respond(inv.id, 'accept')}>
                    接受
                  </Btn>
                  <Btn size="sm" variant="ghost" loading={busy} onClick={() => void respond(inv.id, 'reject')}>
                    拒绝
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {!team ? (
        <Card>
          <div className="card-body">
            <Empty
              icon="⛨"
              text="你还没有加入战队"
              extra={
                data?.createEnabled === false
                  ? '超级管理员当前已关闭战队创建功能，只能通过队长邀请加入。'
                  : '你可以创建一支战队，或等待队长邀请。每位玩家同一时间只能加入一支战队。'
              }
            />
            {data?.createEnabled !== false ? (
              <div className="center">
                <Btn variant="primary" onClick={() => setCreateOpen(true)}>
                  创建战队
                </Btn>
              </div>
            ) : null}
          </div>
        </Card>
      ) : (
        <div className="grid grid-side">
          <div className="stack">
            <Card>
              <CardHead
                title={team.name}
                extra={
                  isCaptain ? (
                    <>
                      <Btn
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setName(team.name);
                          setIntro(team.intro ?? '');
                          setEditOpen(true);
                        }}
                      >
                        编辑资料
                      </Btn>
                      <Btn size="sm" variant="primary" onClick={() => setInviteOpen(true)}>
                        邀请成员
                      </Btn>
                    </>
                  ) : null
                }
              />
              <div className="card-body">
                <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
                  <Avatar src={team.avatar} name={team.name} size="lg" />
                  <div className="flex-1">
                    <p className="muted" style={{ lineHeight: 1.85, fontSize: 13.5 }}>
                      {team.intro || '暂无战队简介'}
                    </p>
                    <div className="row row-wrap mt-12" style={{ gap: 8 }}>
                      <span className="tag">成员 {team.members?.length ?? team.membersCount ?? 0} 人</span>
                      <span className="tag">最低 {data?.minMembers ?? 2} 人 / 最高 {data?.maxMembers ?? 10} 人</span>
                      <span className="tag">创建于 {fmtDateTime(team.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHead title="成员列表" extra={<span className="dim" style={{ fontSize: 12 }}>战队资料仅成员与管理员可见</span>} />
              {!team.members?.length ? (
                <Empty text="暂无成员信息" />
              ) : (
                <div className="table-wrap responsive-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>成员</th>
                        <th>角色</th>
                        <th>加入时间</th>
                        <th className="right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.map((m) => (
                        <tr key={m.userId}>
                          <td>
                            <Link to={`/players/${m.userId}`} className="avatar-wrap">
                              <Avatar src={m.avatar} name={m.nickname} size="sm" />
                              <span className="avatar-name">
                                <span className="n">{m.nickname || `用户 ${m.userId}`}</span>
                                <span className="s">{m.gameId || `ID ${m.userId}`}</span>
                              </span>
                            </Link>
                          </td>
                          <td>
                            {m.role === 'captain' || m.userId === team.captainId ? (
                              <Badge kind="purple">队长</Badge>
                            ) : (
                              <Badge kind="gray">成员</Badge>
                            )}
                          </td>
                          <td className="num">{fmtDateTime(m.joinedAt)}</td>
                          <td className="right">
                            {isCaptain && m.userId !== team.captainId ? (
                              <Btn
                                size="sm"
                                variant="danger"
                                loading={busy}
                                onClick={() =>
                                  void run(() => post(`/me/teams/members/${m.userId}/remove`), '成员已移除')
                                }
                              >
                                移除
                              </Btn>
                            ) : m.userId === user?.id ? (
                              <span className="dim">本人</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="stack">
            <Card>
              <CardHead title="战队操作" />
              <div className="card-body tight">
                <div className="stack-sm">
                  {isCaptain ? (
                    <>
                      <Btn variant="outline" block onClick={() => setInviteOpen(true)}>
                        邀请成员
                      </Btn>
                      <Btn
                        variant="ghost"
                        block
                        onClick={() => {
                          setName(team.name);
                          setIntro(team.intro ?? '');
                          setEditOpen(true);
                        }}
                      >
                        修改战队资料
                      </Btn>
                    </>
                  ) : null}
                  <Btn
                    variant="danger"
                    block
                    loading={busy}
                    onClick={() => {
                      if (window.confirm('确认退出当前战队？退出后需重新被邀请才能加入。')) {
                        void run(() => post('/me/teams/leave'), '已退出战队');
                      }
                    }}
                  >
                    退出战队
                  </Btn>
                </div>
                {isCaptain ? (
                  <Alert kind="warn">
                    队长不能自行转让队长身份、设置副队长或解散战队；如需治理介入请联系超级管理员。
                  </Alert>
                ) : null}
              </div>
            </Card>
            <Card>
              <CardHead title="战队规则" />
              <div className="card-body tight">
                <div className="kv-list">
                  <div className="kv">
                    <span className="k">加入方式</span>
                    <span className="v">仅队长邀请</span>
                  </div>
                  <div className="kv">
                    <span className="k">同时加入</span>
                    <span className="v">仅限一支战队</span>
                  </div>
                  <div className="kv">
                    <span className="k">历史记录</span>
                    <span className="v">保留成员历史</span>
                  </div>
                  <div className="kv">
                    <span className="k">公开性</span>
                    <span className="v">完全私有，无公开主页</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 创建战队 */}
      <Modal
        open={createOpen}
        title="创建战队"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" loading={busy} onClick={() => void createTeam()}>
              创建
            </Btn>
          </>
        }
      >
        <div className="stack">
          <Field label="战队名称" required hint="名称唯一，创建后队长可修改">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入战队名称" />
          </Field>
          <Field label="战队简介">
            <textarea
              className="textarea"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="介绍一下你的战队（仅成员与管理员可见）"
            />
          </Field>
        </div>
      </Modal>

      {/* 编辑战队 */}
      <Modal
        open={editOpen}
        title="修改战队资料"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" loading={busy} onClick={() => void saveTeam()}>
              保存
            </Btn>
          </>
        }
      >
        <div className="stack">
          <Field label="战队名称" required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="战队简介">
            <textarea className="textarea" value={intro} onChange={(e) => setIntro(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* 邀请成员 */}
      <Modal
        open={inviteOpen}
        title="邀请成员"
        onClose={() => setInviteOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setInviteOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" loading={busy} onClick={() => void invite()}>
              发送邀请
            </Btn>
          </>
        }
      >
        <div className="stack">
          <Field label="用户 ID" required hint="填写对方在 XBed 的玩家 ID（可从玩家档案地址 /players/&lt;id&gt; 获取）">
            <input
              className="input"
              value={inviteUserId}
              inputMode="numeric"
              onChange={(e) => setInviteUserId(e.target.value)}
              placeholder="例如 12"
            />
          </Field>
          <Alert kind="info">邀请发送后对方会在通知中心收到站内通知，接受后正式加入；拒绝或过期则不会加入。</Alert>
        </div>
      </Modal>
    </div>
  );
}

export function TeamsPage() {
  return (
    <RequireLogin>
      <TeamsInner />
    </RequireLogin>
  );
}
