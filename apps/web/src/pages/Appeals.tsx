import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadFile, get, post, upload, humanFileSize } from '../lib/api';
import { RequireLogin } from '../lib/auth';
import { useToast } from '../lib/toast';
import {
  Alert,
  Badge,
  Btn,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
} from '../components/ui';
import { APPEAL_STATE, APPEAL_STATE_BADGE, APPEAL_TYPE, label, badge } from '../lib/labels';
import { fmtBytes, fmtDateTime, fromNow } from '../lib/format';
import type { Appeal, AppealAttachment } from '../types';

const ATTACH_ACCEPT = '.log,.txt,.png,.jpg,.jpeg,.zip,.mcpr';
const ATTACH_MAX_MB = 20;

function AttachmentsBlock({
  appealId,
  attachments,
  canUpload,
  onChanged,
}: {
  appealId: number;
  attachments?: AppealAttachment[];
  canUpload: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const list = attachments ?? [];

  const doUpload = async (file: File) => {
    if (file.size > ATTACH_MAX_MB * 1024 * 1024) {
      toast.error(`附件过大，最大 ${ATTACH_MAX_MB} MB（当前 ${humanFileSize(file)}）`);
      return;
    }
    const lower = file.name.toLowerCase();
    if (!['.log', '.txt', '.png', '.jpg', '.jpeg', '.zip', '.mcpr'].some((ext) => lower.endsWith(ext))) {
      toast.error('仅支持 .log / .txt / .png / .jpg / .zip / .mcpr 附件');
      return;
    }
    setUploading(true);
    try {
      await upload(`/appeals/${appealId}/attachments`, file, 'file');
      toast.success('证据附件已上传');
      onChanged();
    } catch {
      /* 全局 toast */
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <div className="dim" style={{ fontSize: 12 }}>
          证据附件 {list.length ? `（${list.length}）` : ''}
        </div>
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ATTACH_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void doUpload(file);
                e.target.value = '';
              }}
            />
            <Btn size="sm" variant="outline" loading={uploading} onClick={() => inputRef.current?.click()}>
              上传附件
            </Btn>
          </>
        ) : null}
      </div>
      {!list.length ? (
        <div className="dim" style={{ fontSize: 12, padding: '10px 0' }}>
          暂未上传证据附件。可上传截图、日志片段或压缩包作为申诉佐证（≤ {ATTACH_MAX_MB} MB）。
        </div>
      ) : (
        <div className="kv-list">
          {list.map((a) => {
            const name = a.fileName || a.originalName || `附件 ${a.id}`;
            return (
              <div className="kv" key={a.id}>
                <span className="k mono truncate" style={{ maxWidth: 260 }}>
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
                      void downloadFile(`/appeals/${appealId}/attachments/${a.id}/download`, name)
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
  );
}

function AppealsInner() {
  const toast = useToast();
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['me', 'appeals'],
    queryFn: async () => {
      const res = await get<{ items?: Appeal[] } | Appeal[]>('/me/appeals');
      return Array.isArray(res) ? res : res.items ?? [];
    },
  });

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ['appeal', detailId],
    queryFn: () => get<Appeal>(`/appeals/${detailId}`),
    enabled: !!detailId,
  });

  const sendReply = async () => {
    if (!detailId) return;
    if (reply.trim().length < 2) {
      toast.error('请输入补充说明');
      return;
    }
    setSending(true);
    try {
      await post(`/appeals/${detailId}/replies`, { content: reply.trim() });
      toast.success('补充说明已提交');
      setReply('');
      await Promise.all([
        refetchDetail(),
        qc.invalidateQueries({ queryKey: ['me', 'appeals'] }),
      ]);
    } catch {
      /* 全局 toast */
    } finally {
      setSending(false);
    }
  };

  const items = data ?? [];
  const current = detailId ? (detail ?? items.find((a) => a.id === detailId) ?? null) : null;

  return (
    <div className="container" style={{ maxWidth: 1000 }}>
      <PageHead
        title="我的申诉"
        desc="仅处理赛果申诉（胜负判定、击杀死亡数据、积分 / 排名 / 段位计算）。正式赛果公布后 48 小时内可提交新申诉。"
        actions={
          <Link to="/me" className="btn btn-ghost btn-sm">
            返回个人中心
          </Link>
        }
      />

      <Alert kind="info">
        申诉由管理员受理、调查证据并作出裁决，处理结果会通过站内通知告知。已提交的申诉在超过申诉期后仍会继续处理。
      </Alert>

      <Card className="mt-16">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !items.length ? (
          <Empty
            icon="✉"
            text="你还没有提交过申诉"
            extra="如果对某场比赛的正式赛果有异议，可在比赛详情页提交申诉。"
          />
        ) : (
          <div className="table-wrap responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>申诉</th>
                  <th>关联比赛</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>提交时间</th>
                  <th className="right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ color: 'var(--text)', fontWeight: 600 }}>#{a.id}</div>
                      <div className="dim truncate" style={{ maxWidth: 320, fontSize: 12 }}>
                        {a.content}
                      </div>
                    </td>
                    <td>
                      <Link to={`/matches/${a.matchId}`} style={{ color: 'var(--purple-soft)' }}>
                        #{a.matchId}
                      </Link>
                    </td>
                    <td>{label(APPEAL_TYPE, a.type)}</td>
                    <td>
                      <Badge kind={badge(APPEAL_STATE_BADGE, a.state)}>{label(APPEAL_STATE, a.state)}</Badge>
                    </td>
                    <td className="num">{fmtDateTime(a.createdAt)}</td>
                    <td className="right">
                      <Btn size="sm" variant="ghost" onClick={() => setDetailId(a.id)}>
                        详情
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!detailId}
        title={current ? `申诉 #${current.id}` : '申诉详情'}
        onClose={() => setDetailId(null)}
        wide
        footer={
          current?.state === 'resolved' || current?.state === 'rejected' ? (
            <Btn variant="ghost" onClick={() => setDetailId(null)}>
              关闭
            </Btn>
          ) : (
            <>
              <Btn variant="ghost" onClick={() => setDetailId(null)}>
                关闭
              </Btn>
              <Btn variant="primary" loading={sending} onClick={() => void sendReply()}>
                提交补充说明
              </Btn>
            </>
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
              <Link to={`/matches/${current.matchId}`} className="tag">
                比赛 #{current.matchId}
              </Link>
              <span className="dim" style={{ fontSize: 12 }}>
                提交于 {fmtDateTime(current.createdAt)}
              </span>
            </div>

            <div className="card flat">
              <div className="card-body">
                <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>申诉内容（{fromNow(current.createdAt)}）</div>
                <p className="prose">{current.content}</p>
              </div>
            </div>

            {current.result || current.resultNote ? (
              <Alert kind="ok">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  裁决结果：{current.result || '已处理'}
                </div>
                {current.resultNote || ''}
                {current.handledAt ? <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>处理时间：{fmtDateTime(current.handledAt)}</div> : null}
              </Alert>
            ) : null}

            <div>
              <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
                处理记录
              </div>
              {!current.replies?.length ? (
                <Empty text="暂无回复" extra="管理员处理后会在此显示回复内容。" />
              ) : (
                <div className="timeline">
                  {current.replies.map((r) => (
                    <div key={r.id} className={`timeline-item ${r.isAdmin ? 'ok' : ''}`}>
                      <div className="timeline-time">
                        {fmtDateTime(r.createdAt)} · {r.isAdmin ? '管理员' : '我'}
                      </div>
                      <div className="timeline-text">{r.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card flat">
              <div className="card-body">
                <AttachmentsBlock
                  appealId={current.id}
                  attachments={current.attachments}
                  canUpload={current.state !== 'resolved' && current.state !== 'rejected'}
                  onChanged={() => {
                    void refetchDetail();
                    void qc.invalidateQueries({ queryKey: ['me', 'appeals'] });
                  }}
                />
              </div>
            </div>

            {current.state !== 'resolved' && current.state !== 'rejected' ? (
              <Field label="补充说明" hint="可追加证据描述、澄清情况，管理员会一并查看">
                <textarea
                  className="textarea"
                  value={reply}
                  placeholder="补充说明…"
                  onChange={(e) => setReply(e.target.value)}
                />
              </Field>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AppealsPage() {
  return (
    <RequireLogin>
      <AppealsInner />
    </RequireLogin>
  );
}
