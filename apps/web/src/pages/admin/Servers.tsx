import { useState } from 'react';
import { post } from '../../lib/api';
import { useAction, useList } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import {
  Alert,
  Badge,
  Btn,
  Card,
  CardHead,
  DataTable,
  Empty,
  ErrorState,
  Field,
  Modal,
  PageHead,
  Pagination,
  type Column,
} from '../../components/ui';
import { fmtDateTime, fromNow } from '../../lib/format';
import type { ServerCredential } from '../../types';

const PAGE_SIZE = 20;

export function AdminServersPage() {
  const { isSuper } = useAuth();
  const act = useAction();
  const [page] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ serverKey: 's1', name: 'S1 起床战争服务器', note: '' });
  const [busy, setBusy] = useState(false);
  const [secretModal, setSecretModal] = useState<{ title: string; secret: string } | null>(null);

  const { data, isLoading, error, refetch } = useList<ServerCredential>(
    ['admin', 'servers', page],
    '/admin/servers',
    { page, pageSize: PAGE_SIZE },
    isSuper,
  );

  const create = async () => {
    if (!form.serverKey.trim() || !form.name.trim()) return;
    setBusy(true);
    try {
      const res = await post<ServerCredential>('/admin/servers', {
        serverKey: form.serverKey.trim(),
        name: form.name.trim(),
        note: form.note.trim(),
      });
      setSecretModal({
        title: '服务器密钥已创建（仅此一次显示，请立即保存）',
        secret: res.secret || res.secretHash || '',
      });
      setCreateOpen(false);
      await act(async () => undefined, { invalidate: [['admin', 'servers']] });
    } catch {
      /* 全局 toast */
    } finally {
      setBusy(false);
    }
  };

  const rotate = async (s: ServerCredential) => {
    if (!window.confirm(`轮换「${s.name || s.serverKey}」的密钥？旧密钥将立即失效，需同步更新服务器插件配置。`)) return;
    setBusy(true);
    try {
      const res = await post<ServerCredential>(`/admin/servers/${s.id}/rotate`);
      setSecretModal({ title: '新密钥（仅此一次显示）', secret: res.secret || res.secretHash || '' });
      await act(async () => undefined, { invalidate: [['admin', 'servers']] });
    } catch {
      /* 全局 toast */
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (s: ServerCredential) => {
    if (!window.confirm(`吊销「${s.name || s.serverKey}」？吊销后该服务器将无法再上报比赛数据。`)) return;
    await act(() => post(`/admin/servers/${s.id}/revoke`), {
      success: '服务器密钥已吊销',
      invalidate: [['admin', 'servers']],
    });
  };

  if (!isSuper) {
    return (
      <div>
        <PageHead title="服务器 API 管理" desc="服务器身份与 HMAC 密钥管理。" />
        <Empty icon="⚙" text="需要超级管理员权限" extra="服务器密钥属于安全配置，仅对 Lv.2 超级管理员开放。" />
      </div>
    );
  }

  const columns: Column<ServerCredential>[] = [
    {
      key: 'server',
      title: '服务器',
      render: (s) => (
        <div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{s.name || s.serverKey}</div>
          <div className="dim mono" style={{ fontSize: 11 }}>{s.serverKey}</div>
        </div>
      ),
      mobileLabel: '服务器',
    },
    {
      key: 'state',
      title: '状态',
      render: (s) => (s.state === 'revoked' ? <Badge kind="red">已吊销</Badge> : <Badge kind="green">启用中</Badge>),
    },
    {
      key: 'lastSeen',
      title: '最后上报',
      render: (s) => <span className="num">{s.lastSeenAt ? fromNow(s.lastSeenAt) : '从未'}</span>,
    },
    {
      key: 'rotated',
      title: '轮换时间',
      align: 'right',
      render: (s) => <span className="num">{s.rotatedAt ? fmtDateTime(s.rotatedAt) : '—'}</span>,
      mobile: false,
    },
    {
      key: 'created',
      title: '创建时间',
      align: 'right',
      render: (s) => <span className="num">{fmtDateTime(s.createdAt)}</span>,
      mobile: false,
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      mobile: false,
      render: (s) =>
        s.state === 'revoked' ? (
          <span className="dim">—</span>
        ) : (
          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
            <Btn size="sm" variant="outline" loading={busy} onClick={() => void rotate(s)}>
              轮换密钥
            </Btn>
            <Btn size="sm" variant="danger" loading={busy} onClick={() => void revoke(s)}>
              吊销
            </Btn>
          </div>
        ),
    },
  ];

  return (
    <div>
      <PageHead
        title="服务器 API 管理"
        desc="游戏服务器使用独立 HMAC-SHA256 密钥上报比赛数据（X-XBed-Server / Timestamp / Nonce / Signature）。密钥明文仅在创建与轮换时展示一次。"
        actions={
          <Btn variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            新建服务器密钥
          </Btn>
        }
      />

      <Alert kind="warn">
        密钥轮换后旧密钥立即失效；吊销后服务器无法上报。所有轮换与吊销操作写入审计日志，请同步更新插件配置文件。
      </Alert>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card className="mt-16">
          <div style={{ padding: 4 }}>
            <DataTable
              columns={columns}
              items={data?.items ?? []}
              rowKey={(s) => s.id}
              loading={isLoading}
              emptyText="暂无服务器密钥"
              mobileTitle={(s) => s.name || s.serverKey}
              mobileSub={(s) => s.state || ''}
            />
          </div>
          {data && data.total > PAGE_SIZE ? (
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={data.page || page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={() => undefined} />
            </div>
          ) : null}
        </Card>
      )}

      <Card className="mt-16">
        <CardHead title="接入说明" />
        <div className="card-body tight">
          <div className="kv-list">
            <div className="kv">
              <span className="k">上报接口</span>
              <span className="v mono">POST /api/ingest/match</span>
            </div>
            <div className="kv">
              <span className="k">心跳接口</span>
              <span className="v mono">GET /api/ingest/ping</span>
            </div>
            <div className="kv">
              <span className="k">认证头</span>
              <span className="v mono" style={{ fontSize: 11 }}>
                X-XBed-Server / X-XBed-Timestamp / X-XBed-Nonce / X-XBed-Signature
              </span>
            </div>
            <div className="kv">
              <span className="k">签名串</span>
              <span className="v mono" style={{ fontSize: 11 }}>
                METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256_HEX(body)
              </span>
            </div>
            <div className="kv">
              <span className="k">时间窗口</span>
              <span className="v">±300 秒，Nonce 5 分钟内不可重复</span>
            </div>
          </div>
        </div>
      </Card>

      <Modal
        open={createOpen}
        title="新建服务器密钥"
        onClose={() => setCreateOpen(false)}
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
        <div className="stack">
          <Field label="服务器标识" required hint="与插件配置一致，如 s1">
            <input className="input" value={form.serverKey} onChange={(e) => setForm({ ...form, serverKey: e.target.value })} />
          </Field>
          <Field label="服务器名称" required>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="备注">
            <textarea className="textarea" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!secretModal}
        title={secretModal?.title || '密钥'}
        onClose={() => setSecretModal(null)}
        footer={
          <Btn variant="primary" onClick={() => setSecretModal(null)}>
            我已保存，关闭
          </Btn>
        }
      >
        <div className="stack">
          <Alert kind="danger">密钥明文只显示这一次，关闭后无法再次查看。请立即复制并安全保存到服务器插件配置中。</Alert>
          <div className="json-block" style={{ userSelect: 'all', fontSize: 13 }}>
            {secretModal?.secret || '（服务端未返回明文，请检查接口）'}
          </div>
        </div>
      </Modal>
    </div>
  );
}
