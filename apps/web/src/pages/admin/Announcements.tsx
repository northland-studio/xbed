import { useState } from 'react';
import { del, patch, post } from '../../lib/api';
import { useAction, useList } from '../../lib/admin';
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
import { ANN_CATEGORY, ANN_CATEGORY_OPTIONS, label } from '../../lib/labels';
import { fmtDateTime } from '../../lib/format';
import type { Announcement } from '../../types';

const PAGE_SIZE = 20;

const EMPTY = { title: '', content: '', category: 'general', pinned: false, published: true };

export function AdminAnnouncementsPage() {
  const act = useAction();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useList<Announcement>(
    ['admin', 'announcements', page],
    '/admin/announcements',
    { page, pageSize: PAGE_SIZE },
  );

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditId(a.id);
    setForm({
      title: a.title,
      content: a.content,
      category: a.category ?? 'general',
      pinned: !!a.pinned,
      published: a.published !== false,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setBusy(true);
    const body = {
      title: form.title.trim(),
      content: form.content,
      category: form.category,
      pinned: form.pinned,
      published: form.published,
    };
    const ok = await act(() => (editId ? patch(`/admin/announcements/${editId}`, body) : post('/admin/announcements', body)), {
      success: editId ? '公告已更新' : '公告已发布',
      invalidate: [['admin', 'announcements'], ['announcements'], ['home', 'announcements']],
    });
    setBusy(false);
    if (ok) setOpen(false);
  };

  const remove = async (a: Announcement) => {
    if (!window.confirm(`确认删除公告「${a.title}」？删除后前台不可见。`)) return;
    await act(() => del(`/admin/announcements/${a.id}`), {
      success: '公告已删除',
      invalidate: [['admin', 'announcements'], ['announcements'], ['home', 'announcements']],
    });
  };

  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      title: '公告',
      render: (a) => (
        <div>
          <div className="row" style={{ gap: 6 }}>
            {a.pinned ? <Badge kind="purple">置顶</Badge> : null}
            {a.published === false ? <Badge kind="gray">未发布</Badge> : null}
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{a.title}</span>
          </div>
          <div className="dim truncate" style={{ maxWidth: 420, fontSize: 11.5 }}>
            {a.content}
          </div>
        </div>
      ),
      mobileLabel: '公告',
    },
    { key: 'category', title: '分类', render: (a) => <Badge kind="gray">{label(ANN_CATEGORY, a.category)}</Badge> },
    { key: 'createdAt', title: '发布时间', align: 'right', render: (a) => <span className="num">{fmtDateTime(a.createdAt)}</span> },
    {
      key: 'actions',
      title: '',
      align: 'right',
      mobile: false,
      render: (a) => (
        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
          <Btn size="sm" variant="ghost" onClick={() => openEdit(a)}>
            编辑
          </Btn>
          <Btn size="sm" variant="danger" onClick={() => void remove(a)}>
            删除
          </Btn>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="公告管理"
        desc="赛事公告用于发布规则、赛程、赛果与重要通知。公告内容永久保留，删除仅使前台不可见。"
        actions={
          <Btn variant="primary" size="sm" onClick={openCreate}>
            发布公告
          </Btn>
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
              emptyText="暂无公告"
              mobileTitle={(a) => a.title}
              mobileSub={(a) => label(ANN_CATEGORY, a.category)}
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
        open={open}
        title={editId ? '编辑公告' : '发布公告'}
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <Btn variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" loading={busy} onClick={() => void save()}>
              {editId ? '保存' : '发布'}
            </Btn>
          </>
        }
      >
        <div className="stack">
          <Field label="标题" required>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="form-grid">
            <Field label="分类">
              <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {ANN_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.text}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="选项">
              <div className="row" style={{ height: 40, gap: 18 }}>
                <label className="check">
                  <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
                  置顶
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  />
                  立即发布
                </label>
              </div>
            </Field>
          </div>
          <Field label="正文" required hint="支持换行，前台按纯文本渲染">
            <textarea
              className="textarea"
              style={{ minHeight: 240 }}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
