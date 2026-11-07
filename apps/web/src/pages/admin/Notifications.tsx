import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post, toList } from '../../lib/api';
import { useAction } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import {
  Alert,
  Btn,
  Card,
  CardHead,
  DataTable,
  Empty,
  ErrorState,
  Field,
  PageHead,
  Pagination,
  type Column,
} from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import type { BroadcastItem } from '../../types';

const PAGE_SIZE = 20;

export function AdminNotificationsPage() {
  const { isSuper } = useAuth();
  const act = useAction();
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ title: '', content: '', link: '' });
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'broadcast', page],
    queryFn: async () => toList<BroadcastItem>(await get('/admin/notifications/broadcast', { page, pageSize: PAGE_SIZE })),
    enabled: isSuper,
    retry: false,
  });

  const send = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setBusy(true);
    const ok = await act(
      () =>
        post('/admin/notifications/broadcast', {
          title: form.title.trim(),
          content: form.content.trim(),
          link: form.link.trim() || undefined,
        }),
      { success: '全站通知已发送', invalidate: [['admin', 'broadcast']] },
    );
    setBusy(false);
    if (ok) setForm({ title: '', content: '', link: '' });
  };

  if (!isSuper) {
    return (
      <div>
        <PageHead title="通知群发" desc="向全站用户发送站内通知。" />
        <Empty icon="✦" text="需要超级管理员权限" extra="通知群发仅对 Lv.2 超级管理员开放。" />
      </div>
    );
  }

  const columns: Column<BroadcastItem>[] = [
    {
      key: 'title',
      title: '通知',
      render: (b) => (
        <div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{b.title}</div>
          <div className="dim truncate" style={{ maxWidth: 380, fontSize: 11.5 }}>
            {b.content}
          </div>
        </div>
      ),
      mobileLabel: '通知',
    },
    { key: 'recipients', title: '接收人数', align: 'right', render: (b) => <span className="num">{b.recipients ?? '—'}</span> },
    { key: 'link', title: '跳转链接', render: (b) => <span className="mono dim" style={{ fontSize: 11 }}>{b.link || '—'}</span>, mobile: false },
    { key: 'createdAt', title: '发送时间', align: 'right', render: (b) => <span className="num">{fmtDateTime(b.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHead title="通知群发" desc="向全站用户发送站内通知。群发记录保留在列表中，接收人会在通知中心看到未读消息。" />

      <div className="grid grid-side">
        <Card>
          <CardHead title="发送新通知" />
          <div className="card-body">
            <div className="stack">
              <Alert kind="warn">群发会立即写入所有用户的站内通知。请确认文案与跳转链接无误，避免重复发送。</Alert>
              <Field label="通知标题" required>
                <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="通知内容" required>
                <textarea
                  className="textarea"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
              </Field>
              <Field label="跳转链接（可选）" hint="站内路径，如 /seasons/1 或 /announcements/3">
                <input className="input" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
              </Field>
              <Btn variant="primary" loading={busy} disabled={!form.title.trim() || !form.content.trim()} onClick={() => void send()}>
                发送全站通知
              </Btn>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="群发历史" />
          {error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <>
              <div style={{ padding: 4 }}>
                <DataTable
                  columns={columns}
                  items={data?.items ?? []}
                  rowKey={(b) => b.id}
                  loading={isLoading}
                  emptyText="暂无群发记录"
                  mobileTitle={(b) => b.title}
                  mobileSub={(b) => fmtDateTime(b.createdAt)}
                />
              </div>
              {data && data.total > PAGE_SIZE ? (
                <div style={{ padding: '0 16px 12px' }}>
                  <Pagination page={data.page || page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
