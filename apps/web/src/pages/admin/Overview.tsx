import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  Badge,
  Card,
  CardHead,
  ErrorState,
  Loading,
  PageHead,
  ProgressRow,
  StatCard,
} from '../../components/ui';
import { AUDIT_ACTION, label } from '../../lib/labels';
import { fmtBytes, fmtDateTime, fmtNum } from '../../lib/format';
import type { AdminOverview } from '../../types';

export function AdminOverviewPage() {
  const { isSuper } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => get<AdminOverview>('/admin/overview'),
    refetchInterval: 60_000,
  });

  if (isLoading) return <Loading text="正在加载后台总览…" />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const counts = data?.counts ?? {};
  const storage = data?.storage ?? {};
  const totalBytes = storage.totalBytes ?? 0;
  const logBytes = storage.logBytes ?? 0;
  const replayBytes = storage.replayBytes ?? 0;

  const apiTodos = data?.todos ?? [];
  const todos = apiTodos.length
    ? apiTodos
    : [
        { label: '待审核赛果', count: counts.pendingMatches, link: '/admin/matches?state=pending' },
        { label: '异常待裁定', count: counts.abnormalMatches, link: '/admin/matches?state=abnormal' },
        { label: '待处理申诉', count: counts.pendingAppeals, link: '/admin/appeals?state=open' },
        { label: '邮件发送失败', count: counts.emailFailed, link: '/admin/files' },
      ];

  return (
    <div>
      <PageHead
        title="后台总览"
        desc="XBed 赛事运营概览：核心数据、存储占用与待办事项。数据每 60 秒自动刷新。"
        actions={
          <Link to="/admin/matches?state=pending" className="btn btn-primary btn-sm">
            前往赛果审核
          </Link>
        }
      />

      <div className="grid grid-4 mb-16">
        <StatCard label="注册用户" value={fmtNum(counts.users)} hint="玄剑成员（含禁用）" accent />
        <StatCard label="赛季总数" value={fmtNum(counts.seasons)} hint="含草稿 / 已封存" />
        <StatCard label="比赛总数" value={fmtNum(counts.matches)} hint="含待审 / 异常 / 已作废" />
        <StatCard label="报名总数" value={fmtNum(counts.registrations)} hint="全部赛季累计" />
      </div>

      <div className="grid grid-4 mb-16">
        <StatCard label="待审核赛果" value={fmtNum(counts.pendingMatches)} hint="需管理员审核" />
        <StatCard label="异常比赛" value={fmtNum(counts.abnormalMatches)} hint="需裁定" />
        <StatCard label="待处理申诉" value={fmtNum(counts.pendingAppeals)} hint="玩家申诉" />
        <StatCard
          label="活跃 / 上报失败"
          value={`${fmtNum(counts.activeUsers ?? counts.users)} / ${fmtNum(counts.failedSubmissions ?? 0)}`}
          hint="活跃用户 / 服务器上报失败"
        />
      </div>

      <div className="grid grid-2 mb-16">
        <Card>
          <CardHead title="存储统计" extra={<Link to="/admin/files" className="section-more">文件管理 →</Link>} />
          <div className="card-body">
            <div className="stack">
              <ProgressRow
                label="latest.log 永久保留"
                value={`${fmtBytes(logBytes)} · ${fmtNum(storage.logCount)} 个文件`}
                percent={totalBytes ? (logBytes / totalBytes) * 100 : 0}
              />
              <ProgressRow
                label=".mcpr 回放（赛季封存后清理）"
                value={`${fmtBytes(replayBytes)} · ${fmtNum(storage.replayCount)} 个文件`}
                percent={totalBytes ? (replayBytes / totalBytes) * 100 : 0}
              />
              <div className="kv-list">
                <div className="kv">
                  <span className="k">文件存储合计</span>
                  <span className="v num">{fmtBytes(totalBytes)}</span>
                </div>
                <div className="kv">
                  <span className="k">文件总数</span>
                  <span className="v num">{fmtNum(storage.fileCount ?? (storage.logCount ?? 0) + (storage.replayCount ?? 0))}</span>
                </div>
                {storage.diskTotalBytes ? (
                  <div className="kv">
                    <span className="k">磁盘剩余</span>
                    <span className="v num">
                      {fmtBytes(storage.diskFreeBytes)} / {fmtBytes(storage.diskTotalBytes)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="待办事项" />
          <div className="card-body tight">
            <div className="kv-list">
              {todos.map((t) => (
                <div className="kv" key={t.label}>
                  <span className="k">{t.label}</span>
                  <span className="v">
                    <Link to={t.link || '/admin'} className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                      <Badge kind={(t.count ?? 0) > 0 ? 'yellow' : 'gray'}>{fmtNum(t.count ?? 0)}</Badge>
                      <span className="dim">处理 →</span>
                    </Link>
                  </span>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div className="kv-list">
              <div className="kv">
                <span className="k">数据库状态</span>
                <span className="v">{data?.db?.ok === false ? '异常' : '正常'}</span>
              </div>
              <div className="kv">
                <span className="k">数据库大小</span>
                <span className="v num">{fmtBytes(data?.db?.sizeBytes)}</span>
              </div>
              {data?.db?.journalMode ? (
                <div className="kv">
                  <span className="k">日志模式</span>
                  <span className="v mono">{data.db.journalMode}</span>
                </div>
              ) : null}
              {data?.system?.node ? (
                <div className="kv">
                  <span className="k">运行环境</span>
                  <span className="v">
                    Node {data.system.node} · {data.system.platform}
                  </span>
                </div>
              ) : null}
              {typeof (data?.system?.uptime ?? data?.uptime) === 'number' ? (
                <div className="kv">
                  <span className="k">运行时长</span>
                  <span className="v num">
                    {Math.floor((data?.system?.uptime ?? data?.uptime ?? 0) / 3600)} 小时
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      {isSuper && data?.recentAudit?.length ? (
        <Card>
          <CardHead title="最近管理操作" extra={<Link to="/admin/audit" className="section-more">完整审计 →</Link>} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作者</th>
                  <th>操作</th>
                  <th>对象</th>
                  <th>理由</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAudit.slice(0, 8).map((a) => (
                  <tr key={a.id}>
                    <td className="num">{fmtDateTime(a.createdAt)}</td>
                    <td>{a.actorNickname || a.actorXuanjianId || '—'}</td>
                    <td>
                      <Badge kind="purple">{label(AUDIT_ACTION, a.action)}</Badge>
                    </td>
                    <td className="mono">
                      {a.targetType ? `${a.targetType}#${a.targetId ?? ''}` : '—'}
                    </td>
                    <td className="dim truncate" style={{ maxWidth: 280 }}>
                      {a.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
