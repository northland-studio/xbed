import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { downloadFile, get, post } from '../../lib/api';
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
  Field,
  JsonBlock,
  Loading,
  Modal,
  PageHead,
  type Column,
} from '../../components/ui';
import {
  EVIDENCE_STATE,
  EVIDENCE_STATE_BADGE,
  EVENT_TYPE,
  EVENT_TYPE_ICON,
  MATCH_STATE,
  MATCH_STATE_BADGE,
  label,
  badge,
} from '../../lib/labels';
import { fmtBytes, fmtDateTime, fmtNum, fmtTime, matchDuration } from '../../lib/format';
import type { AdminMatchDetail, MatchEvidence, MatchEvent, MatchPlayer } from '../../types';

const ACTIONS = [
  { value: 'approve', label: '审核通过（结算积分）', danger: false },
  { value: 'reject', label: '驳回（待补充）', danger: true },
  { value: 'correct', label: '修正赛果后通过', danger: false },
  { value: 'abnormal', label: '标记异常（待裁定）', danger: true },
  { value: 'resolve', label: '裁定有效（异常转正式）', danger: false },
  { value: 'void', label: '作废比赛', danger: true },
];

export function AdminMatchReviewPage() {
  const { id } = useParams<{ id: string }>();
  const matchId = Number(id);
  const { isSuper } = useAuth();
  const act = useAction();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'match', matchId],
    queryFn: () => get<AdminMatchDetail>(`/admin/matches/${matchId}`),
    enabled: Number.isFinite(matchId),
  });

  const [actionOpen, setActionOpen] = useState(false);
  const [action, setAction] = useState('approve');
  const [reason, setReason] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [winnerTeam, setWinnerTeam] = useState('');
  const [isDraw, setIsDraw] = useState(false);
  const [busy, setBusy] = useState(false);

  const players = data?.players ?? [];
  const evidence = data?.evidence ?? [];
  const warnings = data?.warnings ?? [];

  const openAction = (preset?: string) => {
    if (preset) setAction(preset);
    setReason('');
    setCorrectedText(JSON.stringify(players.map((p) => ({
      gameId: p.gameId,
      team: p.team,
      isWinner: !!p.isWinner,
      kills: p.kills ?? 0,
      finalKills: p.finalKills ?? 0,
      deaths: p.deaths ?? 0,
      finalDeaths: p.finalDeaths ?? 0,
      bedsBroken: p.bedsBroken ?? 0,
      placement: p.placement ?? null,
    })), null, 2));
    setWinnerTeam(data?.winnerTeam ?? '');
    setIsDraw(!!data?.isDraw);
    setActionOpen(true);
  };

  const submit = async () => {
    const needReason = ['reject', 'correct', 'abnormal', 'void'].includes(action);
    if (needReason && !reason.trim()) {
      window.alert('该操作必须填写理由');
      return;
    }
    let corrected: unknown;
    if (action === 'correct') {
      try {
        corrected = JSON.parse(correctedText);
      } catch {
        window.alert('修正数据不是合法 JSON，请检查');
        return;
      }
      if (!Array.isArray(corrected) || !corrected.length) {
        window.alert('修正数据必须是非空数组（玩家统计）');
        return;
      }
    }
    setBusy(true);
    const ok = await act(
      () =>
        post(`/admin/matches/${matchId}/review`, {
          action,
          reason: reason.trim(),
          ...(action === 'correct'
            ? { corrected, correctedWinnerTeam: winnerTeam, isDraw }
            : {}),
        }),
      { success: '审核操作已提交', invalidate: [['admin', 'match', matchId], ['admin', 'matches']] },
    );
    setBusy(false);
    if (ok) {
      setActionOpen(false);
      void refetch();
    }
  };

  const download = async (ev: MatchEvidence) => {
    await downloadFile(`/admin/matches/${matchId}/evidence/${ev.id}/download`, ev.originalName || `${ev.kind}-${ev.id}`);
  };

  const evidenceColumns: Column<MatchEvidence>[] = [
    {
      key: 'user',
      title: '玩家',
      render: (e) => (
        <div>
          <div style={{ color: 'var(--text)' }}>{e.nickname || e.gameId || `用户 ${e.userId ?? '—'}`}</div>
          <div className="dim mono" style={{ fontSize: 11 }}>{e.gameId || ''}</div>
        </div>
      ),
      mobileLabel: '玩家',
    },
    {
      key: 'kind',
      title: '类型',
      render: (e) => (e.kind === 'latest_log' ? <Badge kind="cyan">latest.log</Badge> : <Badge kind="purple">.mcpr</Badge>),
    },
    { key: 'name', title: '文件名', render: (e) => <span className="mono" style={{ fontSize: 12 }}>{e.originalName || '—'}</span>, mobile: false },
    { key: 'size', title: '大小', align: 'right', render: (e) => <span className="num">{fmtBytes(e.sizeBytes)}</span> },
    {
      key: 'state',
      title: '状态',
      render: (e) => (
        <div className="row" style={{ gap: 6 }}>
          <Badge kind={badge(EVIDENCE_STATE_BADGE, e.state)}>{label(EVIDENCE_STATE, e.state ?? 'submitted')}</Badge>
          {e.isLate ? <Badge kind="yellow">逾期</Badge> : null}
        </div>
      ),
    },
    { key: 'uploadedAt', title: '上传时间', align: 'right', render: (e) => <span className="num">{fmtDateTime(e.uploadedAt)}</span>, mobile: false },
    {
      key: 'sha',
      title: 'SHA-256',
      render: (e) => <span className="mono dim truncate" style={{ maxWidth: 180, fontSize: 11 }}>{e.sha256 || '—'}</span>,
      mobile: false,
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      render: (e) => (
        <Btn size="sm" variant="ghost" onClick={() => void download(e)}>
          下载
        </Btn>
      ),
    },
  ];

  const playerColumns: Column<MatchPlayer>[] = [
    { key: 'gameId', title: '玩家', render: (p) => <span style={{ color: 'var(--text)' }}>{p.gameId}</span> },
    { key: 'team', title: '队伍', render: (p) => p.team || '—' },
    { key: 'win', title: '结果', render: (p) => (p.isWinner ? <Badge kind="green">胜</Badge> : <Badge kind="gray">负</Badge>) },
    { key: 'kills', title: '击杀', align: 'right', render: (p) => <span className="num">{p.kills ?? 0}</span> },
    { key: 'finalKills', title: '最终击杀', align: 'right', render: (p) => <span className="num">{p.finalKills ?? 0}</span>, mobile: false },
    { key: 'deaths', title: '死亡', align: 'right', render: (p) => <span className="num">{p.deaths ?? 0}</span> },
    { key: 'beds', title: '摧毁床', align: 'right', render: (p) => <span className="num">{p.bedsBroken ?? 0}</span> },
    { key: 'placement', title: '排名', align: 'right', render: (p) => <span className="num">{p.placement ?? '—'}</span>, mobile: false },
  ];

  if (isLoading) return <Loading text="正在加载审核数据…" />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return <Empty text="比赛不存在" />;

  const events = [...(data.events ?? [])].sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return ta - tb;
  });

  const missingLogs = players.filter((p) => !evidence.some((e) => e.kind === 'latest_log' && e.userId === p.userId));
  const missingReplays = players.filter((p) => !evidence.some((e) => e.kind === 'replay' && e.userId === p.userId));

  return (
    <div>
      <PageHead
        title={`审核工作台 · 比赛 #${data.id}`}
        desc={
          <>
            <Badge kind={badge(MATCH_STATE_BADGE, data.state)}>{label(MATCH_STATE, data.state)}</Badge>
            <span style={{ marginLeft: 10 }}>
              {data.arenaDisplay || data.arena || '未知地图'} · {data.mode || '—'} ·{' '}
              {fmtDateTime(data.startedAt)} · 时长 {matchDuration(data.startedAt, data.endedAt)}
            </span>
          </>
        }
        actions={
          <>
            <Link to="/admin/matches" className="btn btn-ghost btn-sm">
              返回列表
            </Link>
            <Link to={`/matches/${data.id}`} className="btn btn-ghost btn-sm">
              前台视图
            </Link>
            <Btn variant="primary" size="sm" onClick={() => openAction()}>
              审核操作
            </Btn>
          </>
        }
      />

      {data.state === 'abnormal' || data.abnormalReason ? (
        <Alert kind="danger">
          异常原因：{data.abnormalReason || '数据不完整或比赛生命周期异常'}。异常比赛不能直接通过，需裁定有效或作废。
        </Alert>
      ) : null}

      {warnings.length ? (
        <Alert kind="warn">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>异常提示</div>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
            {missingLogs.length ? <li>· {missingLogs.length} 名玩家缺少 latest.log</li> : null}
            {missingReplays.length ? <li>· {missingReplays.length} 名玩家缺少 ReplayMod 回放</li> : null}
          </ul>
        </Alert>
      ) : missingLogs.length || missingReplays.length ? (
        <Alert kind="warn">
          材料缺交：{missingLogs.length ? `${missingLogs.length} 名玩家缺少 latest.log` : ''}
          {missingLogs.length && missingReplays.length ? '；' : ''}
          {missingReplays.length ? `${missingReplays.length} 名玩家缺少 .mcpr 回放` : ''}。缺交不自动判定无效，需结合服务器数据裁定。
        </Alert>
      ) : (
        <Alert kind="ok">证据材料齐全：{evidence.length} 份文件已上传。</Alert>
      )}

      <div className="grid grid-4 mt-16 mb-16">
        <div className="stat-card">
          <div className="stat-label">比赛结果</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{data.isDraw ? '平局' : data.winnerTeam || '—'}</div>
          <div className="stat-hint">结束原因：{data.endReason || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">玩家数</div>
          <div className="stat-value">{players.length}</div>
          <div className="stat-hint">事件 {events.length} 条</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">证据文件</div>
          <div className="stat-value">{evidence.length}</div>
          <div className="stat-hint">
            日志 {evidence.filter((e) => e.kind === 'latest_log').length} · 回放{' '}
            {evidence.filter((e) => e.kind === 'replay').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">上报 / 审核</div>
          <div className="stat-value" style={{ fontSize: 13 }}>
            {fmtDateTime(data.submittedAt)}
            <div className="dim">{data.reviewedAt ? fmtDateTime(data.reviewedAt) : '未审核'}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-side">
        <div className="stack">
          <Card>
            <CardHead title="玩家统计（服务器上报）" extra={<span className="dim" style={{ fontSize: 12 }}>修正赛果时以此为基础</span>} />
            <div style={{ padding: 4 }}>
              <DataTable
                columns={playerColumns}
                items={players}
                rowKey={(p) => `${p.id ?? p.gameId}`}
                emptyText="无玩家数据"
                compact
                mobileTitle={(p) => p.gameId}
                mobileSub={(p) => p.team || ''}
              />
            </div>
          </Card>

          <Card>
            <CardHead title="证据文件（日志 / 回放）" extra={<span className="dim" style={{ fontSize: 12 }}>下载会写入审计</span>} />
            <div style={{ padding: 4 }}>
              <DataTable
                columns={evidenceColumns}
                items={evidence}
                rowKey={(e) => e.id}
                emptyText="暂无玩家提交证据"
                compact
                mobileTitle={(e) => `${e.gameId || e.userId} · ${e.kind === 'latest_log' ? 'latest.log' : '.mcpr'}`}
                mobileSub={(e) => label(EVIDENCE_STATE, e.state ?? 'submitted')}
              />
            </div>
          </Card>

          <Card>
            <CardHead title="比赛事件时间线" extra={<span className="dim" style={{ fontSize: 12 }}>共 {events.length} 条</span>} />
            <div className="card-body">
              {!events.length ? (
                <Empty text="无事件数据" />
              ) : (
                <div className="timeline">
                  {events.map((e: MatchEvent, i) => (
                    <div className="timeline-item" key={e.id ?? i}>
                      <div className="timeline-time">{fmtTime(e.at) || '—'}</div>
                      <div className="timeline-text">
                        <span style={{ marginRight: 6 }}>{EVENT_TYPE_ICON[e.type] ?? '·'}</span>
                        {label(EVENT_TYPE, e.type)}
                        {e.actor ? <span className="cyan"> {e.actor}</span> : null}
                        {e.target ? <span className="muted"> → {e.target}</span> : null}
                        {e.team ? <span className="tag" style={{ marginLeft: 8 }}>{e.team}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="修正记录" />
            {!data.resultVersions?.length ? (
              <Empty text="暂无赛果修正记录" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>版本</th>
                      <th>修正人</th>
                      <th>理由</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.resultVersions ?? []).map((v) => (
                      <tr key={v.id}>
                        <td className="num">v{v.version}</td>
                        <td>{v.changedByNickname || v.changedBy || '—'}</td>
                        <td className="dim">{v.reason || '—'}</td>
                        <td className="num">{fmtDateTime(v.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="服务器原始数据" extra={<span className="dim" style={{ fontSize: 12 }}>原始数据不可修改</span>} />
            <div className="card-body tight">
              <div className="kv-list">
                <div className="kv">
                  <span className="k">Schema 版本</span>
                  <span className="v num">{data.rawData?.schemaVersion ?? '—'}</span>
                </div>
                <div className="kv">
                  <span className="k">接收时间</span>
                  <span className="v">{fmtDateTime(data.rawData?.receivedAt)}</span>
                </div>
                <div className="kv">
                  <span className="k">Payload SHA-256</span>
                  <span className="v mono" style={{ fontSize: 11 }}>
                    {data.rawData?.payloadHash || '—'}
                  </span>
                </div>
              </div>
              <div className="divider" />
              <JsonBlock value={data.rawData?.payload ?? data.rawData ?? {}} />
            </div>
          </Card>

          <Card>
            <CardHead title="审核记录" />
            <div className="card-body">
              {!data.reviews?.length ? (
                <Empty text="暂无审核记录" />
              ) : (
                <div className="timeline">
                  {data.reviews.map((r) => (
                    <div key={r.id} className="timeline-item ok">
                      <div className="timeline-time">
                        {fmtDateTime(r.createdAt)} · {r.reviewerNickname || r.reviewerId}
                      </div>
                      <div className="timeline-text">
                        <Badge kind="purple">{r.action}</Badge>
                        {r.beforeState || r.afterState ? (
                          <span className="dim">
                            {' '}
                            {r.beforeState} → {r.afterState}
                          </span>
                        ) : null}
                        {r.reason ? <div className="muted">{r.reason}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {isSuper && data.result ? (
            <Card>
              <CardHead title="正式赛果快照" />
              <div className="card-body tight">
                <JsonBlock value={data.result} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={actionOpen}
        title="审核操作"
        onClose={() => setActionOpen(false)}
        wide
        footer={
          <>
            <Btn variant="ghost" onClick={() => setActionOpen(false)}>
              取消
            </Btn>
            <Btn
              variant={ACTIONS.find((a) => a.value === action)?.danger ? 'danger' : 'primary'}
              loading={busy}
              onClick={() => void submit()}
            >
              确认提交
            </Btn>
          </>
        }
      >
        <div className="stack">
          <Alert kind="warn">
            审核通过后会立即生成正式赛果、结算积分、更新排行榜与个人档案，并通过站内通知告知玩家。操作会写入审计日志。
          </Alert>
          <Field label="操作类型" required>
            <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="操作理由"
            required={['reject', 'correct', 'abnormal', 'void'].includes(action)}
            hint="驳回 / 修正 / 异常 / 作废必须填写，将展示给玩家并写入审计"
          >
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {action === 'correct' ? (
            <>
              <div className="form-grid">
                <Field label="胜者队伍">
                  <input className="input" value={winnerTeam} onChange={(e) => setWinnerTeam(e.target.value)} />
                </Field>
                <Field label="是否平局">
                  <label className="check" style={{ height: 40 }}>
                    <input type="checkbox" checked={isDraw} onChange={(e) => setIsDraw(e.target.checked)} />
                    判定为平局
                  </label>
                </Field>
              </div>
              <Field label="修正后的玩家统计（JSON 数组）" required hint="必须包含 gameId、team、isWinner、kills、deaths 等字段">
                <textarea
                  className="textarea mono"
                  style={{ minHeight: 240 }}
                  value={correctedText}
                  onChange={(e) => setCorrectedText(e.target.value)}
                />
              </Field>
            </>
          ) : null}
          <div className="kv-list">
            <div className="kv">
              <span className="k">比赛</span>
              <span className="v mono">#{data.id}</span>
            </div>
            <div className="kv">
              <span className="k">玩家数</span>
              <span className="v num">{fmtNum(players.length)}</span>
            </div>
            <div className="kv">
              <span className="k">胜者</span>
              <span className="v">{data.isDraw ? '平局' : data.winnerTeam || '—'}</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
