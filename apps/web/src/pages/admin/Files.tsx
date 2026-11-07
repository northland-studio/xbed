import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { del, get, post, toList } from '../../lib/api';
import { useAction } from '../../lib/admin';
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
  PageHead,
  Pagination,
  ProgressRow,
  StatCard,
  type Column,
} from '../../components/ui';
import { fmtBytes, fmtDateTime, fmtNum } from '../../lib/format';
import type { StorageFile, StorageStats } from '../../types';

const PAGE_SIZE = 20;

export function AdminFilesPage() {
  const { isSuper } = useAuth();
  const act = useAction();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'files', kind, page],
    queryFn: async () => {
      const res = await get<{ items?: StorageFile[]; storage?: StorageStats }>('/admin/files', {
        kind: kind || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      const list = toList<StorageFile>(res);
      return { ...list, storage: res.storage ?? {} };
    },
  });

  const storage = data?.storage ?? {};

  const remove = async (f: StorageFile) => {
    if (!window.confirm(`确认删除文件「${f.originalName || f.id}」？仅异常比赛 / 赛季清理场景允许，删除写入审计且不可恢复。`)) return;
    await act(() => del(`/admin/files/${f.id}`), {
      success: '文件已删除（已写入审计）',
      invalidate: [['admin', 'files'], ['admin', 'overview']],
    });
  };

  const cleanup = async () => {
    if (!window.confirm('清理已封存赛季的 .mcpr 回放？正式赛果、统计与审核记录会保留，此操作不可撤销。')) return;
    setBusy(true);
    await act(() => post('/admin/files/cleanup-replays'), {
      success: '回放清理任务已执行',
      invalidate: [['admin', 'files'], ['admin', 'overview']],
    });
    setBusy(false);
  };

  const columns: Column<StorageFile>[] = [
    {
      key: 'file',
      title: '文件',
      render: (f) => (
        <div>
          <div className="row" style={{ gap: 6 }}>
            {f.kind === 'latest_log' ? <Badge kind="cyan">latest.log</Badge> : <Badge kind="purple">.mcpr</Badge>}
            <span className="mono" style={{ fontSize: 12 }}>{f.originalName || `文件 ${f.id}`}</span>
          </div>
          {f.sha256 ? <div className="dim mono truncate" style={{ maxWidth: 300, fontSize: 10.5 }}>{f.sha256}</div> : null}
        </div>
      ),
      mobileLabel: '文件',
    },
    {
      key: 'match',
      title: '比赛',
      render: (f) => <span className="mono">{f.matchId ? `#${f.matchId}` : '—'}</span>,
    },
    {
      key: 'user',
      title: '提交玩家',
      render: (f) => <span>{f.nickname || (f.userId ? `用户 ${f.userId}` : '—')}</span>,
    },
    { key: 'size', title: '大小', align: 'right', render: (f) => <span className="num">{fmtBytes(f.sizeBytes)}</span> },
    {
      key: 'uploadedAt',
      title: '上传时间',
      align: 'right',
      render: (f) => <span className="num">{fmtDateTime(f.uploadedAt)}</span>,
      mobile: false,
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      mobile: false,
      render: (f) =>
        isSuper ? (
          <Btn size="sm" variant="danger" onClick={() => void remove(f)}>
            删除
          </Btn>
        ) : (
          <span className="dim">只读</span>
        ),
    },
  ];

  return (
    <div>
      <PageHead
        title="文件管理"
        desc="证据文件（latest.log 永久保留，.mcpr 赛季封存后清理）。下载与管理操作均写入审计日志。"
        actions={
          isSuper ? (
            <Btn variant="outline" size="sm" loading={busy} onClick={() => void cleanup()}>
              清理已封存赛季回放
            </Btn>
          ) : (
            <span className="dim" style={{ fontSize: 12 }}>删除 / 清理需超级管理员权限</span>
          )
        }
      />

      <div className="grid grid-4 mb-16">
        <StatCard label="存储合计" value={fmtBytes(storage.totalBytes)} hint={`共 ${fmtNum(storage.fileCount ?? storage.totalFiles)} 个文件`} accent />
        <StatCard label="latest.log" value={fmtBytes(storage.logBytes)} hint={`${fmtNum(storage.logCount)} 个文件 · 永久保留`} />
        <StatCard label=".mcpr 回放" value={fmtBytes(storage.replayBytes)} hint={`${fmtNum(storage.replayCount)} 个文件`} />
        <StatCard
          label="磁盘剩余"
          value={fmtBytes(storage.diskFreeBytes)}
          hint={storage.diskTotalBytes ? `总容量 ${fmtBytes(storage.diskTotalBytes)}` : '服务端未上报磁盘信息'}
        />
      </div>

      <Card className="mb-16">
        <CardHead title="存储占用" />
        <div className="card-body">
          <div className="stack">
            <ProgressRow
              label="latest.log"
              value={fmtBytes(storage.logBytes)}
              percent={storage.totalBytes ? ((storage.logBytes ?? 0) / storage.totalBytes) * 100 : 0}
            />
            <ProgressRow
              label=".mcpr 回放"
              value={fmtBytes(storage.replayBytes)}
              percent={storage.totalBytes ? ((storage.replayBytes ?? 0) / storage.totalBytes) * 100 : 0}
            />
          </div>
        </div>
      </Card>

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div className="filter-bar">
          <select
            className="select"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部类型</option>
            <option value="latest_log">latest.log</option>
            <option value="replay">.mcpr 回放</option>
          </select>
          <span className="dim" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
            共 <span className="counter">{data?.total ?? 0}</span> 个文件
          </span>
        </div>
      </Card>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.items.length && !isLoading ? (
        <Empty icon="▣" text="没有符合条件的文件" />
      ) : (
        <Card>
          <div style={{ padding: 4 }}>
            <DataTable
              columns={columns}
              items={data?.items ?? []}
              rowKey={(f) => f.id}
              loading={isLoading}
              emptyText="没有文件"
              mobileTitle={(f) => f.originalName || `文件 ${f.id}`}
              mobileSub={(f) => fmtBytes(f.sizeBytes)}
            />
          </div>
          {data && data.total > PAGE_SIZE ? (
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={data.page || page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
            </div>
          ) : null}
        </Card>
      )}

      <Alert kind="info">
        文件保存在服务端私有目录，文件名随机生成，扩展名白名单校验。删除证据仅用于异常比赛 / 赛季清理，正式赛果与审核记录不受影响。
      </Alert>
    </div>
  );
}
