import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, toList } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  Badge,
  Btn,
  Card,
  DataTable,
  Empty,
  ErrorState,
  JsonBlock,
  Modal,
  PageHead,
  Pagination,
  type Column,
} from '../../components/ui';
import { AUDIT_ACTION, AUDIT_ACTION_BADGE, badge, label } from '../../lib/labels';
import { fmtDateTime } from '../../lib/format';
import type { AuditLog } from '../../types';

const PAGE_SIZE = 20;

const ACTION_OPTIONS = Object.entries(AUDIT_ACTION).map(([value, text]) => ({ value, text }));

export function AdminAuditPage() {
  const { isSuper } = useAuth();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'audit', action, page],
    queryFn: async () =>
      toList<AuditLog>(await get('/admin/audit', { action: action || undefined, page, pageSize: PAGE_SIZE })),
    enabled: isSuper,
    retry: false,
  });

  if (!isSuper) {
    return (
      <div>
        <PageHead title="操作审计" desc="关键管理操作审计日志（只读）。" />
        <Empty icon="☰" text="需要超级管理员权限" extra="审计日志仅对 Lv.2 超级管理员开放，且不可修改或删除。" />
      </div>
    );
  }

  const columns: Column<AuditLog>[] = [
    {
      key: 'createdAt',
      title: '时间',
      render: (a) => <span className="num" style={{ fontSize: 12 }}>{fmtDateTime(a.createdAt)}</span>,
    },
    {
      key: 'actor',
      title: '操作者',
      render: (a) => (
        <div>
          <div>{a.actorNickname || a.actorUserId || '—'}</div>
          <div className="dim mono" style={{ fontSize: 10.5 }}>{a.actorXuanjianId || ''}</div>
        </div>
      ),
    },
    {
      key: 'action',
      title: '操作类型',
      render: (a) => <Badge kind={badge(AUDIT_ACTION_BADGE, a.action)}>{label(AUDIT_ACTION, a.action)}</Badge>,
    },
    {
      key: 'target',
      title: '操作对象',
      render: (a) => <span className="mono" style={{ fontSize: 11.5 }}>{a.targetType ? `${a.targetType}#${a.targetId ?? ''}` : '—'}</span>,
    },
    {
      key: 'reason',
      title: '理由',
      render: (a) => <span className="dim truncate" style={{ maxWidth: 240, fontSize: 12 }}>{a.reason || '—'}</span>,
      mobile: false,
    },
    {
      key: 'ip',
      title: 'IP',
      render: (a) => <span className="mono dim" style={{ fontSize: 11 }}>{a.ip || '—'}</span>,
      mobile: false,
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      mobile: false,
      render: (a) => (
        <Btn size="sm" variant="ghost" onClick={() => setDetail(a)}>
          详情
        </Btn>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="操作审计"
        desc="记录积分修改、赛果审核与修正、申诉裁决、权限 / 规则 / 密钥变更等关键操作。审计只读，不提供删除功能。"
        actions={
          <select
            className="select"
            style={{ width: 170, height: 34 }}
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部操作类型</option>
            {ACTION_OPTIONS.map((o) => (
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
              emptyText="没有审计记录"
              mobileTitle={(a) => label(AUDIT_ACTION, a.action)}
              mobileSub={(a) => fmtDateTime(a.createdAt)}
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
        open={!!detail}
        title={detail ? `审计记录 #${detail.id}` : '审计详情'}
        onClose={() => setDetail(null)}
        wide
        footer={
          <Btn variant="ghost" onClick={() => setDetail(null)}>
            关闭
          </Btn>
        }
      >
        {detail ? (
          <div className="stack">
            <div className="kv-list">
              <div className="kv">
                <span className="k">操作类型</span>
                <span className="v">
                  <Badge kind={badge(AUDIT_ACTION_BADGE, detail.action)}>{label(AUDIT_ACTION, detail.action)}</Badge>
                </span>
              </div>
              <div className="kv">
                <span className="k">操作者</span>
                <span className="v">
                  {detail.actorNickname || '—'}（ID {detail.actorUserId ?? '—'} / 玄剑 {detail.actorXuanjianId || '—'}）
                </span>
              </div>
              <div className="kv">
                <span className="k">操作对象</span>
                <span className="v mono">
                  {detail.targetType ? `${detail.targetType}#${detail.targetId ?? ''}` : '—'}
                </span>
              </div>
              <div className="kv">
                <span className="k">操作时间</span>
                <span className="v">{fmtDateTime(detail.createdAt)}</span>
              </div>
              <div className="kv">
                <span className="k">IP</span>
                <span className="v mono">{detail.ip || '—'}</span>
              </div>
              <div className="kv">
                <span className="k">理由</span>
                <span className="v">{detail.reason || '—'}</span>
              </div>
            </div>
            <div>
              <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>变更前数据</div>
              <JsonBlock value={detail.beforeData ?? '（无）'} />
            </div>
            <div>
              <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>变更后数据</div>
              <JsonBlock value={detail.afterData ?? '（无）'} />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
