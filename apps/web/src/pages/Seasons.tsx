import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get, toList } from '../lib/api';
import { Empty, ErrorState, Loading, PageHead, Alert } from '../components/ui';
import { SeasonCard } from '../components/cards';
import type { Paginated, Season } from '../types';

export function SeasonsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['seasons', 'list'],
    queryFn: async () => toList<Season>(await get<Paginated<Season>>('/seasons')),
    staleTime: 30_000,
  });

  const items = data?.items ?? [];
  const active = items.filter((s) => s.state === 'registration' || s.state === 'running');
  const others = items.filter((s) => s.state !== 'registration' && s.state !== 'running');

  return (
    <div className="container">
      <PageHead
        title="赛事中心"
        desc="XBed 玄剑起床战争挑战赛 · 赛季列表。点击赛季查看完整规则、报名要求、排行榜与比赛记录。"
        actions={
          <Link to="/leaderboard" className="btn btn-outline btn-sm">
            跨赛季排行榜
          </Link>
        }
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !items.length ? (
        <Empty
          icon="◷"
          text="暂无已发布赛季"
          extra="赛季由超级管理员创建并发布。当前还没有公开的赛季，请关注赛事公告。"
        />
      ) : (
        <>
          {active.length ? (
            <>
              <h2 className="section-title" style={{ fontSize: 18, marginBottom: 16 }}>
                进行中 / 报名中
              </h2>
              <div className="grid grid-3">
                {active.map((s) => (
                  <SeasonCard key={s.id} season={s} />
                ))}
              </div>
            </>
          ) : null}

          {others.length ? (
            <>
              <h2 className="section-title" style={{ fontSize: 18, margin: '34px 0 16px' }}>
                历史赛季
              </h2>
              <div className="grid grid-3">
                {others.map((s) => (
                  <SeasonCard key={s.id} season={s} />
                ))}
              </div>
            </>
          ) : null}

          <Alert kind="info">
            报名要求：玄剑公会成员，且需先在个人中心完成邮箱验证。报名材料符合要求后自动通过，无需人工逐条审核。
          </Alert>
        </>
      )}
    </div>
  );
}
