import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, upload, humanFileSize } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import {
  Alert,
  Badge,
  Btn,
  Card,
  CardHead,
  DataTable,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
  type Column,
} from '../components/ui';
import {
  APPEAL_TYPE_OPTIONS,
  EVIDENCE_STATE,
  EVIDENCE_STATE_BADGE,
  EVENT_TYPE,
  EVENT_TYPE_ICON,
  MATCH_STATE,
  MATCH_STATE_BADGE,
  label,
  badge,
} from '../lib/labels';
import { countdown, fmtBytes, fmtDateTime, fmtTime, matchDuration } from '../lib/format';
import type { EvidenceStatus, Match, MatchEvent, MatchPlayer } from '../types';

/* ============ 证据上传 ============ */
function EvidenceUploader({
  matchId,
  kind,
  title,
  hint,
  accept,
  maxMb,
  onUploaded,
}: {
  matchId: number;
  kind: 'log' | 'replay';
  title: string;
  hint: string;
  accept: string;
  maxMb: number;
  onUploaded: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const doUpload = async (file: File) => {
    const lower = file.name.toLowerCase();
    const okExt = kind === 'log' ? lower.endsWith('.log') || lower.endsWith('.txt') : lower.endsWith('.mcpr');
    if (!okExt) {
      toast.error(kind === 'log' ? '仅支持 .log / .txt 文件' : '仅支持 .mcpr 回放文件');
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`文件过大，最大 ${maxMb} MB（当前 ${humanFileSize(file)}）`);
      return;
    }
    setProgress(0);
    try {
      await upload(`/matches/${matchId}/evidence/${kind}`, file, 'file', (p) => setProgress(p));
      toast.success(`${title}上传成功`);
      onUploaded();
    } catch {
      /* 全局 toast 已提示 */
    } finally {
      setProgress(null);
    }
  };

  return (
    <div
      className={`upload-zone${dragging ? ' dragging' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void doUpload(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void doUpload(file);
          e.target.value = '';
        }}
      />
      {progress !== null ? (
        <>
          <div className="up-icon">⇪</div>
          <div style={{ marginBottom: 8 }}>上传中… {progress}%</div>
          <div className="bar-track" style={{ maxWidth: 260, margin: '0 auto' }}>
            <div className="bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </>
      ) : (
        <>
          <div className="up-icon">⇪</div>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
            {hint}
          </div>
        </>
      )}
    </div>
  );
}

function EvidencePanel({ matchId, endedAt }: { matchId: number; endedAt?: string | null }) {
  const { isLoggedIn } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'evidence', matchId],
    queryFn: () => get<EvidenceStatus>(`/me/matches/${matchId}/evidence`),
    enabled: isLoggedIn,
    retry: false,
  });

  const refetch = () => void qc.invalidateQueries({ queryKey: ['me', 'evidence', matchId] });

  if (!isLoggedIn) {
    return (
      <Card>
        <CardHead title="证据提交" />
        <div className="card-body">
          <Alert kind="info">
            只有参赛玩家本人可以在比赛结束后 1 小时内提交 latest.log 与 ReplayMod 回放。登录后查看你的提交状态。
          </Alert>
          <div className="mt-12">
            <Link to="/login" className="btn btn-outline btn-sm">
              登录查看
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const late = data?.deadline ? new Date(data.deadline).getTime() < Date.now() : false;
  const logs = data?.logs;
  const replay = data?.replay;

  return (
    <Card>
      <CardHead
        title="我的证据提交"
        extra={
          data?.deadline ? (
            <span className={`badge ${late ? 'badge-red' : 'badge-yellow'}`}>
              {late ? '已逾期（仍可补交并标记逾期）' : `截止：${countdown(data.deadline)}`}
            </span>
          ) : null
        }
      />
      <div className="card-body tight">
        {isLoading ? (
          <Loading text="正在读取提交状态…" />
        ) : (
          <>
            <div className="kv-list">
              <div className="kv">
                <span className="k">证据截止</span>
                <span className="v">{fmtDateTime(data?.deadline) || '比赛结束后 60 分钟'}</span>
              </div>
              <div className="kv">
                <span className="k">latest.log</span>
                <span className="v">
                  <Badge kind={badge(EVIDENCE_STATE_BADGE, logs?.state)}>
                    {label(EVIDENCE_STATE, logs?.state ?? 'missing')}
                  </Badge>
                  {logs?.originalName ? (
                    <div className="dim" style={{ fontSize: 11.5 }}>{logs.originalName}</div>
                  ) : null}
                  {logs?.sizeBytes ? <div className="dim" style={{ fontSize: 11.5 }}>{fmtBytes(logs.sizeBytes)}</div> : null}
                </span>
              </div>
              <div className="kv">
                <span className="k">ReplayMod 回放</span>
                <span className="v">
                  <Badge kind={badge(EVIDENCE_STATE_BADGE, replay?.state)}>
                    {label(EVIDENCE_STATE, replay?.state ?? 'missing')}
                  </Badge>
                  {replay?.originalName ? (
                    <div className="dim" style={{ fontSize: 11.5 }}>{replay.originalName}</div>
                  ) : null}
                  {replay?.sizeBytes ? (
                    <div className="dim" style={{ fontSize: 11.5 }}>{fmtBytes(replay.sizeBytes)}</div>
                  ) : null}
                </span>
              </div>
            </div>

            {late ? (
              <Alert kind="warn">
                已超过比赛结束 1 小时。逾期提交会被标记为 late，是否有效由管理员结合服务器数据与其他证据裁定。
              </Alert>
            ) : null}

            <div className="stack mt-12">
              <EvidenceUploader
                matchId={matchId}
                kind="log"
                title="上传 latest.log"
                hint="仅 .log / .txt，≤ 20MB；系统会计算 SHA-256"
                accept=".log,.txt"
                maxMb={20}
                onUploaded={refetch}
              />
              <EvidenceUploader
                matchId={matchId}
                kind="replay"
                title="上传 ReplayMod 回放"
                hint="仅 .mcpr，≤ 300MB；原始回放永久保留不覆盖"
                accept=".mcpr"
                maxMb={300}
                onUploaded={refetch}
              />
            </div>
            <p className="dim mt-12" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
              证据文件仅本人与管理员可下载，普通玩家之间不可见。文件缺失时该玩家成绩暂不正式生效。
              {endedAt ? ` 本场比赛结束于 ${fmtDateTime(endedAt)}。` : ''}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

/* ============ 申诉入口 ============ */
function AppealPanel({ matchId, endedAt }: { matchId: number; endedAt?: string | null }) {
  const { isLoggedIn } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('result');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const deadline = endedAt ? new Date(new Date(endedAt).getTime() + 48 * 3600 * 1000) : null;
  const canAppeal = deadline ? deadline.getTime() > Date.now() : false;

  const submit = async () => {
    if (content.trim().length < 10) {
      toast.error('申诉内容至少 10 个字，请说明具体问题');
      return;
    }
    setSubmitting(true);
    try {
      await post(`/matches/${matchId}/appeals`, { type, content: content.trim() });
      toast.success('申诉已提交，管理员处理后会通过站内通知回复');
      setOpen(false);
      setContent('');
    } catch {
      /* 全局 toast */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHead title="赛果申诉" />
      <div className="card-body tight">
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
          对比赛胜负、击杀死亡数据、积分结算等有异议，可在正式赛果公布后 48 小时内提交申诉。
        </p>
        <div className="kv mt-8">
          <span className="k">申诉截止</span>
          <span className="v">
            {deadline ? canAppeal ? <span className="warn">{countdown(deadline.toISOString())}</span> : '已过申诉期' : '—'}
          </span>
        </div>
        <div className="row mt-12">
          {isLoggedIn ? (
            <Btn variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!canAppeal}>
              提交申诉
            </Btn>
          ) : (
            <Link to="/login" className="btn btn-outline btn-sm">
              登录后申诉
            </Link>
          )}
          <Link to="/me/appeals" className="btn btn-ghost btn-sm">
            我的申诉
          </Link>
        </div>
      </div>
      <Modal
        open={open}
        title="提交赛果申诉"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" loading={submitting} onClick={() => void submit()}>
              提交申诉
            </Btn>
          </>
        }
      >
        <div className="stack">
          <Alert kind="info">仅处理赛果类争议（胜负、击杀死亡、积分、排名）。管理员主动纠错不受此期限限制。</Alert>
          <Field label="申诉类型" required>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {APPEAL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.text}
                </option>
              ))}
            </select>
          </Field>
          <Field label="申诉说明" required hint="请描述具体问题、期望的处理结果，并尽可能提供可核验的信息">
            <textarea
              className="textarea"
              value={content}
              placeholder="例如：比赛结束时我方仍有玩家存活，服务器判定的胜者与实际不符……"
              onChange={(e) => setContent(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

/* ============ 事件时间线 ============ */
function EventTimeline({ events }: { events: MatchEvent[] }) {
  if (!events.length) return <Empty text="暂无事件记录" extra="事件以服务器插件实际支持能力为准。" />;
  return (
    <div className="timeline">
      {events.map((e, i) => {
        const type = e.type ?? 'event';
        return (
          <div
            className={`timeline-item ${
              type === 'kill' ? 'ok' : type === 'team_eliminated' ? 'danger' : type === 'bed_break' ? 'warn' : ''
            }`}
            key={e.id ?? i}
          >
            <div className="timeline-time">{fmtTime(e.at) || '—'}</div>
            <div className="timeline-text">
              <span style={{ marginRight: 6 }}>{EVENT_TYPE_ICON[type] ?? '·'}</span>
              <span style={{ color: 'var(--text)' }}>{label(EVENT_TYPE, type)}</span>
              {e.actor ? <span className="cyan"> {e.actor}</span> : null}
              {e.target ? <span className="muted"> → {e.target}</span> : null}
              {e.team ? (
                <span className="tag" style={{ marginLeft: 8 }}>
                  {e.team}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============ 页面 ============ */
export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const matchId = Number(id);

  const { data: match, isLoading, error, refetch } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => get<Match>(`/matches/${matchId}`),
    enabled: Number.isFinite(matchId),
  });

  const playerColumns: Column<MatchPlayer>[] = [
    {
      key: 'gameId',
      title: '玩家',
      render: (p) => (
        <div className="row">
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{p.gameId}</span>
          {p.userId ? (
            <Link to={`/players/${p.userId}`} className="tag">
              档案
            </Link>
          ) : null}
        </div>
      ),
      mobileLabel: '玩家',
    },
    { key: 'team', title: '队伍', render: (p) => p.team || '—' },
    {
      key: 'isWinner',
      title: '结果',
      render: (p) => (p.isWinner ? <Badge kind="green">胜利</Badge> : <Badge kind="gray">失败</Badge>),
    },
    { key: 'kills', title: '击杀', align: 'right', render: (p) => <span className="num">{p.kills ?? 0}</span> },
    {
      key: 'finalKills',
      title: '最终击杀',
      align: 'right',
      render: (p) => <span className="num">{p.finalKills ?? 0}</span>,
    },
    { key: 'deaths', title: '死亡', align: 'right', render: (p) => <span className="num">{p.deaths ?? 0}</span> },
    {
      key: 'finalDeaths',
      title: '最终死亡',
      align: 'right',
      mobile: false,
      render: (p) => <span className="num">{p.finalDeaths ?? 0}</span>,
    },
    {
      key: 'bedsBroken',
      title: '摧毁床',
      align: 'right',
      render: (p) => <span className="num">{p.bedsBroken ?? 0}</span>,
    },
    {
      key: 'placement',
      title: '排名',
      align: 'right',
      render: (p) => <span className="num">{p.placement ?? '—'}</span>,
    },
  ];

  if (isLoading) {
    return (
      <div className="container">
        <Loading text="正在加载比赛详情…" />
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
  if (!match) {
    return (
      <div className="container">
        <Empty icon="⚔" text="比赛不存在" extra="该比赛可能尚未审核通过或不对外公开。" />
      </div>
    );
  }

  const players = match.players ?? [];
  const events = [...(match.events ?? [])].sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return ta - tb;
  });

  const winners = players.filter((p) => p.isWinner);

  return (
    <div className="container">
      <PageHead
        title={`比赛 #${match.id}`}
        desc={
          <>
            {match.season ? (
              <Link to={`/seasons/${match.season.id}`} className="tag" style={{ marginRight: 8 }}>
                {match.season.name}
              </Link>
            ) : null}
            <Badge kind={badge(MATCH_STATE_BADGE, match.state)}>{label(MATCH_STATE, match.state)}</Badge>
            <span style={{ marginLeft: 10 }}>
              {match.arenaDisplay || match.arena || '未知地图'} · {match.mode || '未知模式'}
            </span>
          </>
        }
        actions={
          <Link to="/matches" className="btn btn-ghost btn-sm">
            返回比赛列表
          </Link>
        }
      />

      <div className="grid grid-4 mb-16">
        <div className="stat-card">
          <div className="stat-label">比赛结果</div>
          <div className="stat-value" style={{ fontSize: 20 }}>
            {match.isDraw ? '平局' : match.winnerTeam || '待定'}
          </div>
          <div className="stat-hint">结束原因：{match.endReason || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">开始 / 结束</div>
          <div className="stat-value" style={{ fontSize: 14 }}>
            {fmtDateTime(match.startedAt)}
            <div className="dim">{fmtDateTime(match.endedAt)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">比赛时长</div>
          <div className="stat-value" style={{ fontSize: 20 }}>
            {matchDuration(match.startedAt, match.endedAt)}
          </div>
          <div className="stat-hint">参赛玩家 {players.length} 人</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">审核时间</div>
          <div className="stat-value" style={{ fontSize: 14 }}>
            {fmtDateTime(match.reviewedAt)}
          </div>
          <div className="stat-hint">提交：{fmtDateTime(match.submittedAt)}</div>
        </div>
      </div>

      {match.state === 'abnormal' || match.abnormalReason ? (
        <Alert kind="danger">
          本场比赛被标记为异常：{match.abnormalReason || '数据不完整或生命周期异常'}。异常比赛不进入正式积分结算与排行榜，最终处理结果以管理员裁定为准。
        </Alert>
      ) : null}

      <div className="grid grid-side mt-16">
        <div className="stack">
          <Card>
            <CardHead
              title="玩家统计"
              extra={
                winners.length ? (
                  <span className="tag">
                    胜者队伍：
                    {Array.from(new Set(winners.map((w) => w.team).filter(Boolean))).join('、') || '—'}
                  </span>
                ) : null
              }
            />
            <div style={{ padding: 4 }}>
              <DataTable
                columns={playerColumns}
                items={players}
                rowKey={(p) => `${p.id ?? p.gameId}`}
                emptyText="暂无玩家统计"
                compact
                mobileTitle={(p) => p.gameId}
                mobileSub={(p) => p.team || ''}
              />
            </div>
          </Card>

          <Card>
            <CardHead
              title="比赛事件时间线"
              extra={<span className="dim" style={{ fontSize: 12 }}>共 {events.length} 条</span>}
            />
            <div className="card-body">
              <EventTimeline events={events} />
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="比赛信息" />
            <div className="card-body tight">
              <div className="kv-list">
                <div className="kv">
                  <span className="k">比赛编号</span>
                  <span className="v mono">#{match.id}</span>
                </div>
                <div className="kv">
                  <span className="k">服务器</span>
                  <span className="v">{match.serverId || 's1'}</span>
                </div>
                <div className="kv">
                  <span className="k">地图</span>
                  <span className="v">{match.arenaDisplay || match.arena || '—'}</span>
                </div>
                <div className="kv">
                  <span className="k">模式</span>
                  <span className="v">{match.mode || '—'}</span>
                </div>
                <div className="kv">
                  <span className="k">外部比赛 ID</span>
                  <span className="v mono" style={{ fontSize: 11 }}>
                    {match.externalMatchId || '—'}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">比赛时长</span>
                  <span className="v">{matchDuration(match.startedAt, match.endedAt)}</span>
                </div>
                <div className="kv">
                  <span className="k">结束原因</span>
                  <span className="v">{match.endReason || '—'}</span>
                </div>
              </div>
            </div>
          </Card>
          <EvidencePanel matchId={matchId} endedAt={match.endedAt} />
          <AppealPanel matchId={matchId} endedAt={match.endedAt} />
          <Card>
            <CardHead title="说明" />
            <div className="card-body tight">
              <p className="dim" style={{ fontSize: 11.5, lineHeight: 1.8 }}>
                本页展示的赛果均来自审核通过的正式数据。服务器原始日志、其他玩家的 latest.log 与 .mcpr 回放文件不向普通玩家开放。
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
