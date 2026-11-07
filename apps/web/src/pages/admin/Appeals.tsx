import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { downloadFile, get, post } from '../../lib/api';
import { useAction, useList } from '../../lib/admin';
import {
  Alert,
  Badge,
  Btn,
  Card,
  DataTable,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
  Pagination,
  type Column,
} from '../../components/ui';
import { APPEAL_STATE, APPEAL_STATE_BADGE, APPEAL_STATE_OPTIONS, APPEAL_TYPE, label, badge } from '../../lib/labels';
import { fmtBytes, fmtDateTime, fromNow } from '../../lib/format';
import type { Appeal } from '../../types';

const PAGE_SIZE = 20;

export function AdminAppealsPage() {
  const act = useAction();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const state = searchParams.get('state') ?? '';
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [resolveKind, setResolveKind] = useState<'resolved' | 'rejected'>('resolved');
  const [resultNote, setResultNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useList<Appeal>(
    ['admin', 'appeals', state, page],
    '/admin/appeals',
    { state: state || undefined, page, pageSize: PAGE_SIZE },
  );

  const { data: detail } = useQuery({
    queryKey: ['appeal', detailId],
    queryFn: () => get<Appeal>(`/appeals/${detailId}`),
    enabled: !!detailId,
  });

  const current = detailId ? detail ?? data?.items.find((a) => a.id === detailId) ?? null : null;

  const setStateFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set('state', v);
    else next.delete('state');
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const sendReply = async () => {
    if (!detailId || !reply.trim()) return;
    setBusy(true);
    const ok = await act(() => post(`/admin/appeals/${detailId}/reply`, { content: reply.trim() }), {
      success: '回复已发送',
      invalidate: [['admin', 'appeals'], ['appeal', detailId]],
    });
    setBusy(false);
    if (ok) setReply('');
  };

  const resolve = async () => {
    if (!detailId) return;
    setBusy(true);
    const ok = await act(
      () =>
        post(`/admin/appeals/${detailId}/resolve`, {
          state: resolveKind,
          result: resolveKind === 'resolved' ? '申诉成立' : '申诉驳回',
          note: resultNote.trim(),
        }),
      { success: '申诉已裁决', invalidate: [['admin', 'appeals'], ['appeal', detailId]] },
    );
    setBusy(false);
    if (ok) {
      setDetailId(null);
      setResultNote('');
    }
  };

  const columns: Column<Appeal>[] = [
    {
      key: 'id',
      title: '申诉',
      render: (a) => (
        <div>
          <div className="mono" style={{ color: 'var(--purple-soft)' }}>#{a.id}</div>
          <div className="dim truncate" style={{ maxWidth: 260, fontSize: 11.5 }}>
            {a.content}
          </div>
        </div>
      ),
      mobileLabel: '申诉',
    },
    {
      key: 'user',
      title: '申诉人',
      render: (a) => <span>{a.nickname || `用户 ${a.userId}`}</span>,
    },
    {
      key: 'match',
      title: '比赛',
      render: (a) => (
        <Link to={`/admin/matches/${a.matchId}`} className="mono" style={{ color: 'var(--cyan-soft)' }}>
          #{a.matchId}
        </Link>
      ),
    },
    { key: 'type', title: '类型', render: (a) => label(APPEAL_TYPE, a.type), mobile: false },
    {
      key: 'state',
      title: '状态',
      render: (a) => <Badge kind={badge(APPEAL_STATE_BADGE, a.state)}>{label(APPEAL_STATE, a.state)}</Badge>,
    },
    {
      key: 'createdAt',
      title: '提交时间',
      align: 'right',
      render: (a) => <span className="num">{fromNow(a.createdAt)}</span>,
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      mobile: false,
      render: (a) => (
        <Btn size="sm" variant="outline" onClick={() => setDetailId(a.id)}>
          处理
        </Btn>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="申诉处理"
        desc="受理玩家赛果申诉、调查证据、回复并裁决。所有处理行为写入审计日志，结果通过站内通知告知玩家。"
        actions={
          <select className="select" style={{ width: 140, height: 34 }} value={state} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">全部状态</option>
            {APPEAL_STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.text}
              </option>
            ))}
          </select>
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
              rowKey={(a) => a.id}
              loading={isLoading}
              emptyText="没有符合条件的申诉"
              mobileTitle={(a) => `申诉 #${a.id}`}
              mobileSub={(a) => label(APPEAL_STATE, a.state)}
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
        open={!!detailId}
        title={current ? `申诉 #${current.id}` : '申诉详情'}
        onClose={() => setDetailId(null)}
        wide
        footer={
          current && current.state !== 'resolved' && current.state !== 'rejected' ? (
            <>
              <Btn variant="ghost" onClick={() => setDetailId(null)}>
                关闭
              </Btn>
              <Btn variant="primary" loading={busy} onClick={() => void resolve()}>
                提交裁决（{resolveKind === 'resolved' ? '成立' : '驳回'}）
              </Btn>
            </>
          ) : (
            <Btn variant="ghost" onClick={() => setDetailId(null)}>
              关闭
            </Btn>
          )
        }
      >
        {!current ? (
          <Loading />
        ) : (
          <div className="stack">
            <div className="row row-wrap">
              <Badge kind={badge(APPEAL_STATE_BADGE, current.state)}>{label(APPEAL_STATE, current.state)}</Badge>
              <span className="tag">{label(APPEAL_TYPE, current.type)}</span>
              <Link to={`/admin/matches/${current.matchId}`} className="tag">
                比赛 #{current.matchId}
              </Link>
              <span className="dim" style={{ fontSize: 12 }}>
                提交于 {fmtDateTime(current.createdAt)}
              </span>
            </div>

            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="card flat">
                <div className="card-body">
                  <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>申诉人</div>
                  <div>{current.nickname || `用户 ${current.userId}`}</div>
                </div>
              </div>
              <div className="card flat">
                <div className="card-body">
                  <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>关联比赛</div>
                  <Link to={`/admin/matches/${current.matchId}`} style={{ color: 'var(--purple-soft)' }}>
                    查看比赛审核页 →
                  </Link>
                </div>
              </div>
            </div>

            <div className="card flat">
              <div className="card-body">
                <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>申诉内容</div>
                <p className="prose">{current.content}</p>
              </div>
            </div>

            {current.result || current.resultNote ? (
              <Alert kind="ok">
                <div style={{ fontWeight: 600 }}>裁决：{current.result || '已处理'}</div>
                {current.resultNote || ''}
              </Alert>
            ) : null}

            <div>
              <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>处理记录</div>
              {!current.replies?.length ? (
                <Empty text="暂无回复" />
              ) : (
                <div className="timeline">
                  {current.replies.map((r) => (
                    <div key={r.id} className={`timeline-item ${r.isAdmin ? 'ok' : ''}`}>
                      <div className="timeline-time">
                        {fmtDateTime(r.createdAt)} · {r.isAdmin ? '管理员' : r.nickname || '玩家'}
                      </div>
                      <div className="timeline-text">{r.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card flat">
              <div className="card-body">
                <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
                  证据附件 {current.attachments?.length ? `（${current.attachments.length}）` : '（无）'}
                </div>
                {!current.attachments?.length ? (
                  <div className="dim" style={{ fontSize: 12 }}>
                    玩家未上传申诉附件。
                  </div>
                ) : (
                  <div className="kv-list">
                    {current.attachments.map((a) => {
                      const name = a.fileName || a.originalName || `附件 ${a.id}`;
                      return (
                        <div className="kv" key={a.id}>
                          <span className="k mono truncate" style={{ maxWidth: 300 }}>
                            {name}
                          </span>
                          <span className="v">
                            <span className="dim" style={{ fontSize: 11.5 }}>
                              {fmtBytes(a.sizeBytes)} · {fmtDateTime(a.uploadedAt)}
                            </span>{' '}
                            <Btn
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void downloadFile(
                                  `/appeals/${current.id}/attachments/${a.id}/download`,
                                  name,
                                )
                              }
                            >
                              下载
                            </Btn>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {current.state !== 'resolved' && current.state !== 'rejected' ? (
              <>
                <Field label="回复玩家">
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <textarea
                      className="textarea flex-1"
                      value={reply}
                      placeholder="说明调查进展、需要补充的材料等"
                      onChange={(e) => setReply(e.target.value)}
                    />
                    <Btn variant="outline" loading={busy} onClick={() => void sendReply()}>
                      发送回复
                    </Btn>
                  </div>
                </Field>
                <div className="divider" />
                <div className="form-grid">
                  <Field label="裁决结果">
                    <select
                      className="select"
                      value={resolveKind}
                      onChange={(e) => setResolveKind(e.target.value as 'resolved' | 'rejected')}
                    >
                      <option value="resolved">申诉成立（修正赛果 / 积分）</option>
                      <option value="rejected">申诉驳回</option>
                    </select>
                  </Field>
                  <Field label="裁决说明">
                    <input className="input" value={resultNote} onChange={(e) => setResultNote(e.target.value)} />
                  </Field>
                </div>
                <Alert kind="warn">裁决提交后申诉进入终态；如需修正赛果，请先到比赛审核工作台执行「修正赛果」。</Alert>
              </>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
