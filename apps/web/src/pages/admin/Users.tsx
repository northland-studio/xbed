import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, patch, toList } from '../../lib/api';
import { useAction } from '../../lib/admin';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  DataTable,
  ErrorState,
  PageHead,
  Pagination,
  type Column,
} from '../../components/ui';
import { fmtDateTime, fmtNum } from '../../lib/format';
import type { Paginated, User } from '../../types';

const PAGE_SIZE = 20;

const LEVEL_TEXT: Record<number, string> = {
  [-1]: '托管账号',
  0: '成员',
  1: '管理员',
  2: '超级管理员',
};

export function AdminUsersPage() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const act = useAction();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'users', search, level, page],
    queryFn: async () =>
      toList<User>(
        await get<Paginated<User>>('/admin/users', {
          query: search || undefined,
          level: level || undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
      ),
  });

  const toggleStatus = async (u: User) => {
    setBusyId(u.id);
    const next = u.status === 'disabled' ? 'active' : 'disabled';
    await act(() => patch(`/admin/users/${u.id}`, { status: next }), {
      success: next === 'disabled' ? '用户已禁用' : '用户已启用',
      invalidate: [['admin', 'users']],
    });
    setBusyId(null);
  };

  const columns: Column<User>[] = [
    {
      key: 'user',
      title: '用户',
      render: (u) => (
        <div className="row" style={{ gap: 10 }}>
          <Avatar src={u.avatar} name={u.nickname || u.username} size="sm" />
          <div className="avatar-name">
            <span className="n">{u.nickname || u.username}</span>
            <span className="s">@{u.username} · ID {u.id}</span>
          </div>
        </div>
      ),
      mobileLabel: '用户',
    },
    { key: 'level', title: '玄剑等级', render: (u) => LEVEL_TEXT[u.level ?? 0] ?? `Lv.${u.level}` },
    { key: 'gameId', title: '游戏 ID', render: (u) => <span className="mono">{u.gameId || '—'}</span> },
    {
      key: 'email',
      title: '邮箱',
      render: (u) => (
        <div>
          <div style={{ fontSize: 12.5 }}>{u.email || '未填写'}</div>
          {u.email ? (
            u.emailVerified ? <Badge kind="green">已验证</Badge> : <Badge kind="yellow">未验证</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'contribution',
      title: '贡献点',
      align: 'right',
      mobile: false,
      render: (u) => <span className="num">{fmtNum(Math.round(u.contribution ?? 0))}</span>,
    },
    {
      key: 'status',
      title: '状态',
      render: (u) => (u.status === 'disabled' ? <Badge kind="red">已禁用</Badge> : <Badge kind="green">正常</Badge>),
    },
    {
      key: 'createdAt',
      title: '注册时间',
      align: 'right',
      mobile: false,
      render: (u) => <span className="num">{fmtDateTime(u.createdAt)}</span>,
    },
    {
      key: 'action',
      title: '',
      align: 'right',
      mobile: false,
      render: (u) => (
        <Btn
          size="sm"
          variant={u.status === 'disabled' ? 'success' : 'danger'}
          loading={busyId === u.id}
          onClick={() => void toggleStatus(u)}
        >
          {u.status === 'disabled' ? '启用' : '禁用'}
        </Btn>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        title="用户管理"
        desc="玄剑用户同步数据。管理员只能启用 / 禁用账号，不能修改玄剑等级或角色（等级完全由 OAuth 同步）。"
      />

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div className="filter-bar">
          <input
            className="input"
            placeholder="搜索用户名 / 昵称 / 游戏 ID / 邮箱"
            value={query}
            style={{ minWidth: 260 }}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearch(query);
                setPage(1);
              }
            }}
          />
          <Btn
            size="sm"
            variant="primary"
            onClick={() => {
              setSearch(query);
              setPage(1);
            }}
          >
            搜索
          </Btn>
          <select
            className="select"
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部等级</option>
            <option value="0">L0 成员</option>
            <option value="1">L1 管理员</option>
            <option value="2">L2 超级管理员</option>
          </select>
          <span className="dim" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
            共 <span className="counter">{data?.total ?? 0}</span> 人
          </span>
        </div>
      </Card>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card>
          <div style={{ padding: 4 }}>
            <DataTable
              columns={columns}
              items={data?.items ?? []}
              rowKey={(u) => u.id}
              loading={isLoading}
              emptyText="没有匹配的用户"
              mobileTitle={(u) => u.nickname || u.username || `用户 ${u.id}`}
              mobileSub={(u) => `Lv.${u.level ?? 0}`}
            />
          </div>
          {data && data.total > PAGE_SIZE ? (
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination
                page={data.page || page}
                pageSize={data.pageSize || PAGE_SIZE}
                total={data.total}
                onChange={setPage}
              />
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
