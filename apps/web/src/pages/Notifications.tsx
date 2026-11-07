import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../lib/api';
import { RequireLogin } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Badge, Btn, Card, Empty, ErrorState, Loading, PageHead, Pagination, Tabs } from '../components/ui';
import { NOTIFICATION_TYPE, label } from '../lib/labels';
import { fmtDateTime, fromNow } from '../lib/format';
import type { Notification, Paginated } from '../types';

const PAGE_SIZE = 20;

function NotificationsInner() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['me', 'notifications', unreadOnly, page],
    queryFn: async () => {
      const res = await get<Paginated<Notification> & { unread?: number }>('/me/notifications', {
        page,
        pageSize: PAGE_SIZE,
        unread: unreadOnly ? 1 : undefined,
      });
      const items = Array.isArray(res) ? (res as unknown as Notification[]) : res.items ?? [];
      const total = Array.isArray(res) ? items.length : res.total ?? items.length;
      return { items, total, unread: res.unread ?? items.filter((n) => !n.isRead).length };
    },
  });

  const markRead = async (ids: number[], all = false) => {
    try {
      await post('/me/notifications/read', all ? { all: true } : { ids });
      toast.success(all ? '已全部标记为已读' : '已标记为已读');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['me', 'notifications'] }),
        qc.invalidateQueries({ queryKey: ['notifications', 'unread'] }),
      ]);
    } catch {
      /* 全局 toast */
    }
  };

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <PageHead
        title="通知中心"
        desc="报名结果、战队邀请、赛果公布、积分 / 段位变化、公告发布与申诉处理等站内通知。"
        actions={
          <>
            <Btn size="sm" variant="outline" onClick={() => void markRead([], true)}>
              全部标为已读
            </Btn>
            <Link to="/me" className="btn btn-ghost btn-sm">
              返回个人中心
            </Link>
          </>
        }
      />

      <Tabs
        value={unreadOnly ? 'unread' : 'all'}
        onChange={(v) => {
          setUnreadOnly(v === 'unread');
          setPage(1);
        }}
        items={[
          { value: 'all', label: '全部通知', count: data?.total },
          { value: 'unread', label: '未读', count: data?.unread },
        ]}
      />

      <Card>
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !data?.items.length ? (
          <Empty icon="✉" text={unreadOnly ? '没有未读通知' : '暂无通知'} />
        ) : (
          <div>
            {data.items.map((n) => (
              <div
                key={n.id}
                className="announce-item"
                style={{ background: n.isRead ? undefined : 'rgba(139,92,246,0.05)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <Badge kind={n.isRead ? 'gray' : 'purple'}>{label(NOTIFICATION_TYPE, n.type)}</Badge>
                    <span style={{ fontWeight: 600 }}>{n.title}</span>
                    {!n.isRead ? <span className="tier-dot" style={{ color: '#22d3ee' }} /> : null}
                  </div>
                  {n.content ? (
                    <div className="muted" style={{ fontSize: 13, lineHeight: 1.75 }}>
                      {n.content}
                    </div>
                  ) : null}
                  <div className="row mt-8" style={{ gap: 12 }}>
                    <span className="dim" style={{ fontSize: 11.5 }} title={fmtDateTime(n.createdAt)}>
                      {fromNow(n.createdAt)}
                    </span>
                    {n.link ? (
                      <Link to={n.link} className="section-more" style={{ fontSize: 12 }}>
                        查看详情 →
                      </Link>
                    ) : null}
                    {!n.isRead ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ height: 26, padding: '0 10px', fontSize: 12 }}
                        onClick={() => void markRead([n.id])}
                      >
                        标为已读
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data && data.total > PAGE_SIZE ? (
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
      ) : null}
    </div>
  );
}

export function NotificationsPage() {
  return (
    <RequireLogin>
      <NotificationsInner />
    </RequireLogin>
  );
}
