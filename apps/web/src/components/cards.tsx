import { Link } from 'react-router-dom';
import type { Announcement, Match, Season } from '../types';
import { Badge, TierChip } from './ui';
import { MATCH_STATE, MATCH_STATE_BADGE, SEASON_STATE, SEASON_STATE_BADGE, ANN_CATEGORY, label, badge } from '../lib/labels';
import { fmtDateTime, fmtMonthDay, fmtNum, fmtRange, matchDuration } from '../lib/format';

/** 比赛卡片：首页 / 比赛列表 / 玩家档案共用 */
export function MatchCard({ match }: { match: Match }) {
  const state = match.state ?? 'approved';
  const title = match.arenaDisplay || match.arena || '未知地图';
  return (
    <Link to={`/matches/${match.id}`} className="match-card">
      <div className="match-thumb">{(match.mode || 'BW').slice(0, 2).toUpperCase()}</div>
      <div className="match-main">
        <div className="match-title">
          <span>{title}</span>
          <Badge kind={badge(MATCH_STATE_BADGE, state)}>{label(MATCH_STATE, state)}</Badge>
          {match.isDraw ? <span className="tag">平局</span> : null}
        </div>
        <div className="match-meta">
          <span>#{match.id}</span>
          {match.mode ? <span>{match.mode}</span> : null}
          <span>{fmtDateTime(match.startedAt || match.submittedAt)}</span>
          <span>时长 {matchDuration(match.startedAt, match.endedAt)}</span>
        </div>
      </div>
      <div className="match-side">
        {match.winnerTeam ? (
          <div>
            胜者 <span className="cyan">{match.winnerTeam}</span>
          </div>
        ) : match.isDraw ? (
          <div className="muted">平局</div>
        ) : (
          <div className="dim">赛果待定</div>
        )}
        {match.playerCount ? <div className="dim">{match.playerCount} 名玩家</div> : null}
        {match.season?.name ? <div className="dim truncate">{match.season.name}</div> : null}
      </div>
    </Link>
  );
}

/** 公告列表行 */
export function AnnouncementRow({ item }: { item: Announcement }) {
  const { day, month } = fmtMonthDay(item.createdAt);
  return (
    <Link to={`/announcements/${item.id}`} className="announce-item">
      <div className="announce-date">
        <div className="d">{day}</div>
        <div className="m">{month}</div>
      </div>
      <div className="announce-main">
        <div className="announce-title">
          {item.pinned ? <Badge kind="purple">置顶</Badge> : null}
          <span className="truncate">{item.title}</span>
        </div>
        <div className="announce-excerpt">{item.content}</div>
      </div>
      <div style={{ flex: 'none' }}>
        <Badge kind="gray">{label(ANN_CATEGORY, item.category)}</Badge>
      </div>
    </Link>
  );
}

/** 赛季卡片 */
export function SeasonCard({ season }: { season: Season }) {
  const state = season.state ?? 'draft';
  const regOpen = (state === 'registration' || state === 'running') && season.registrationOpen !== false;
  const isLate = state === 'running';
  return (
    <Link to={`/seasons/${season.id}`} className="card hoverable" style={{ display: 'block', padding: 22 }}>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <span className="tag">{season.code || `S${season.id}`}</span>
        <Badge kind={badge(SEASON_STATE_BADGE, state)}>{label(SEASON_STATE, state)}</Badge>
      </div>
      <h3 style={{ fontSize: 19, marginBottom: 8 }}>{season.name}</h3>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, minHeight: 44, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {season.description || '暂无赛季介绍'}
      </p>
      <div className="kv-list mt-12">
        <div className="kv">
          <span className="k">赛程</span>
          <span className="v">{fmtRange(season.startAt, season.endAt)}</span>
        </div>
        <div className="kv">
          <span className="k">报名人数</span>
          <span className="v num">{fmtNum(season.registrationCount ?? season.playerCount)}</span>
        </div>
        <div className="kv">
          <span className="k">初始积分 / 胜负</span>
          <span className="v num">
            {season.initialPoints ?? 60} / {season.winPoints ?? 5}:{season.lossPoints ?? -5}
          </span>
        </div>
      </div>
      <div className="row mt-16">
        {regOpen ? (
          <span className="btn btn-primary btn-sm">{isLate ? '补报参赛' : '立即报名'}</span>
        ) : (
          <span className="btn btn-ghost btn-sm">查看详情</span>
        )}
        {regOpen ? <span className="tag">{isLate ? '补报开放' : '报名开放'}</span> : null}
      </div>
    </Link>
  );
}

export function TierCell({ tier }: { tier?: { name: string; color?: string } | null }) {
  return <TierChip tier={tier} />;
}
