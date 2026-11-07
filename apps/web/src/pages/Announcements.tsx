import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, toList } from '../lib/api';
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Loading,
  PageHead,
  Pagination,
  Tabs,
} from '../components/ui';
import { AnnouncementRow } from '../components/cards';
import { ANN_CATEGORY, ANN_CATEGORY_OPTIONS, label } from '../lib/labels';
import { fmtDateTime } from '../lib/format';
import type { Announcement, Paginated } from '../types';

const PAGE_SIZE = 15;

export function AnnouncementsPage() {
  const [category, setCategory] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['announcements', page],
    queryFn: async () => toList<Announcement>(await get<Paginated<Announcement>>('/announcements', { page, pageSize: PAGE_SIZE })),
  });

  const items = useMemo(
    () => (data?.items ?? []).filter((a) => category === 'all' || a.category === category),
    [data, category],
  );

  return (
    <div className="container">
      <PageHead
        title="赛事公告"
        desc="赛季规则、赛程安排、赛果公布与重要通知。公告由管理员发布，内容永久保留。"
      />

      <Tabs
        value={category}
        onChange={(v) => {
          setCategory(v);
        }}
        items={[{ value: 'all', label: '全部' }, ...ANN_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.text }))]}
      />

      <Card>
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !items.length ? (
          <Empty icon="☰" text="暂无公告" extra="管理员发布公告后会显示在这里。" />
        ) : (
          <div style={{ padding: '2px 4px' }}>
            {items.map((a) => (
              <AnnouncementRow key={a.id} item={a} />
            ))}
          </div>
        )}
      </Card>

      {data && data.total > 0 ? (
        <Pagination page={data.page || page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
      ) : null}
    </div>
  );
}

export function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const announcementId = Number(id);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['announcement', announcementId],
    queryFn: () => get<Announcement>(`/announcements/${announcementId}`),
    enabled: Number.isFinite(announcementId),
  });

  if (isLoading) {
    return (
      <div className="container">
        <Loading text="正在加载公告…" />
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
  if (!data) {
    return (
      <div className="container">
        <Empty icon="☰" text="公告不存在" />
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <PageHead
        title={data.title}
        desc={
          <>
            <Badge kind="purple">{label(ANN_CATEGORY, data.category)}</Badge>
            <span style={{ marginLeft: 10 }}>{fmtDateTime(data.createdAt)}</span>
            {data.authorNickname ? <span style={{ marginLeft: 10 }}>发布者：{data.authorNickname}</span> : null}
          </>
        }
        actions={
          <Link to="/announcements" className="btn btn-ghost btn-sm">
            返回公告列表
          </Link>
        }
      />
      <Card>
        <div className="card-body">
          <div className="prose">{data.content}</div>
        </div>
      </Card>
    </div>
  );
}
