import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, toList } from '../lib/api';
import { RequireLogin, useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import {
  Alert,
  Badge,
  Btn,
  Card,
  CardHead,
  Check,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHead,
} from '../components/ui';
import { EmailVerifyBox } from '../components/EmailVerify';
import { SEASON_STATE, SEASON_STATE_BADGE, label, badge } from '../lib/labels';
import { fmtRange } from '../lib/format';
import type { Paginated, PlayerProfile, Registration, SeasonDetail } from '../types';

function RegisterInner() {
  const { id } = useParams<{ id: string }>();
  const seasonId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: season, isLoading, error, refetch } = useQuery({
    queryKey: ['season', seasonId],
    queryFn: () => get<SeasonDetail>(`/seasons/${seasonId}`),
    enabled: Number.isFinite(seasonId),
  });

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => get<PlayerProfile>('/me/profile'),
    retry: false,
  });

  const { data: registrations } = useQuery({
    queryKey: ['me', 'registrations'],
    queryFn: async () => toList<Registration>(await get<Paginated<Registration>>('/me/registrations')),
    retry: false,
  });

  const existing = registrations?.items.find((r) => r.seasonId === seasonId) ?? null;

  const emailVerified = profile?.emailVerified ?? profile?.user?.emailVerified ?? user?.emailVerified ?? false;
  const currentEmail = profile?.email ?? profile?.user?.email ?? user?.email ?? null;

  const [gameId, setGameId] = useState<string>('');
  const [custom, setCustom] = useState<Record<string, string | boolean>>({});
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const effectiveGameId = gameId || user?.gameId || '';
  const fields = season?.fields ?? [];

  const missingRequired = useMemo(
    () =>
      fields
        .filter((f) => f.required)
        .filter((f) => {
          const v = custom[f.key];
          return f.type === 'checkbox' ? v !== true : !String(v ?? '').trim();
        })
        .map((f) => f.label),
    [fields, custom],
  );

  const open = (season?.state === 'registration' || season?.state === 'running') && season.registrationOpen !== false;
  const isLate = season?.state === 'running';

  const submit = async () => {
    if (!effectiveGameId.trim()) {
      toast.error('请填写 Minecraft 游戏 ID');
      return;
    }
    if (missingRequired.length) {
      toast.error(`请填写必填字段：${missingRequired.join('、')}`);
      return;
    }
    if (!emailVerified) {
      toast.error('请先完成邮箱验证后再报名');
      return;
    }
    if (!agree) {
      toast.error('请先阅读并同意赛事规则');
      return;
    }
    setSubmitting(true);
    try {
      await post(`/seasons/${seasonId}/register`, {
        gameId: effectiveGameId.trim(),
        game_id: effectiveGameId.trim(),
        custom: custom as Record<string, unknown>,
      });
      toast.success('报名成功，你已获得该赛季参赛资格');
      await Promise.all([qc.invalidateQueries({ queryKey: ['me', 'registrations'] }), refetch()]);
      navigate(`/seasons/${seasonId}`);
    } catch {
      /* 全局 toast 已提示 */
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container">
        <Loading text="正在加载报名信息…" />
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
  if (!season) {
    return (
      <div className="container">
        <Empty icon="◷" text="赛季不存在" />
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 980 }}>
      <PageHead
        title="赛季报名"
        desc={
          <>
            {season.name} · <Badge kind={badge(SEASON_STATE_BADGE, season.state)}>{label(SEASON_STATE, season.state)}</Badge>{' '}
            <span className="dim">赛程 {fmtRange(season.startAt, season.endAt)}</span>
          </>
        }
        actions={
          <Link to={`/seasons/${seasonId}`} className="btn btn-ghost btn-sm">
            返回赛季详情
          </Link>
        }
      />

      {existing ? (
        <Card>
          <CardHead title="你已报名该赛季" />
          <div className="card-body">
            <Alert kind="ok">
              报名记录已存在{existing.gameId ? `，游戏 ID：${existing.gameId}` : ''}。同一赛季无需重复报名，可直接参加符合条件的正式比赛。
            </Alert>
            <div className="row mt-16">
              <Link to="/me" className="btn btn-outline btn-sm">
                查看我的报名
              </Link>
              <Link to={`/seasons/${seasonId}`} className="btn btn-ghost btn-sm">
                查看赛季详情
              </Link>
            </div>
          </div>
        </Card>
      ) : !open ? (
        <Card>
          <div className="card-body">
            <Alert kind="warn">
              当前赛季报名未开放（状态：{label(SEASON_STATE, season.state)}）。
              {season.state === 'running' ? '赛季进行中，但补报通道已关闭。' : '请关注赛事公告获取报名开放时间。'}
            </Alert>
            <div className="mt-16">
              <Link to={`/seasons/${seasonId}`} className="btn btn-outline btn-sm">
                返回赛季详情
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-side">
          <Card>
            <CardHead title={isLate ? '补报信息' : '报名信息'} />
            <div className="card-body">
              {isLate ? (
                <Alert kind="warn">
                  赛季已开始，当前报名属于<strong>补报</strong>。补报只统计报名之后完成的正式比赛，补报前的比赛不计入个人成绩；
                  初始积分仍为 {season.initialPoints} 分，仍可正常参与后续对局排行。
                </Alert>
              ) : null}
              <div className="stack">
                <Field
                  label="Minecraft 游戏 ID"
                  required
                  hint="由玄剑 OAuth 同步。若与实际游戏 ID 不一致，请在此修正（未报名赛季时允许修改）。"
                >
                  <input
                    className="input"
                    value={effectiveGameId}
                    placeholder="输入你的游戏 ID"
                    onChange={(e) => setGameId(e.target.value)}
                  />
                </Field>

                {fields.length ? (
                  <>
                    <div className="divider" />
                    <div className="dim" style={{ fontSize: 12.5 }}>
                      以下为本赛季自定义报名字段：
                    </div>
                    {fields.map((f) => {
                      const value = custom[f.key];
                      return (
                        <Field key={f.id} label={f.label} required={f.required}>
                          {f.type === 'textarea' ? (
                            <textarea
                              className="textarea"
                              value={String(value ?? '')}
                              placeholder={`请输入${f.label}`}
                              onChange={(e) => setCustom((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            />
                          ) : f.type === 'select' ? (
                            <select
                              className="select"
                              value={String(value ?? '')}
                              onChange={(e) => setCustom((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            >
                              <option value="">请选择</option>
                              {(f.options ?? []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : f.type === 'checkbox' ? (
                            <Check
                              checked={value === true}
                              onChange={(v) => setCustom((prev) => ({ ...prev, [f.key]: v }))}
                            >
                              我确认
                            </Check>
                          ) : (
                            <input
                              className="input"
                              type={f.type === 'number' ? 'number' : 'text'}
                              value={String(value ?? '')}
                              placeholder={`请输入${f.label}`}
                              onChange={(e) => setCustom((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            />
                          )}
                        </Field>
                      );
                    })}
                  </>
                ) : null}

                <div className="divider" />
                <Check checked={agree} onChange={setAgree}>
                  我已阅读并同意该赛季的赛事规则，承诺遵守赛果审核与证据提交要求（比赛结束后 1 小时内提交
                  latest.log 与 ReplayMod 回放）。
                </Check>

                {missingRequired.length ? (
                  <Alert kind="warn">还需填写：{missingRequired.join('、')}</Alert>
                ) : null}

                <div className="row row-wrap">
                  <Btn variant="primary" onClick={() => void submit()} loading={submitting} disabled={!emailVerified}>
                    提交报名
                  </Btn>
                  <Link to={`/seasons/${seasonId}`} className="btn btn-ghost">
                    取消
                  </Link>
                </div>
              </div>
            </div>
          </Card>

          <div className="stack">
            <Card>
              <CardHead title="邮箱验证" />
              <div className="card-body tight">
                <EmailVerifyBox
                  currentEmail={currentEmail}
                  verified={emailVerified}
                  onDone={() => void refetchProfile()}
                />
              </div>
            </Card>
            <Card>
              <CardHead title="报名须知" />
              <div className="card-body tight">
                <div className="kv-list">
                  <div className="kv">
                    <span className="k">参赛资格</span>
                    <span className="v">玄剑公会成员（登录时校验）</span>
                  </div>
                  <div className="kv">
                    <span className="k">邮箱要求</span>
                    <span className="v">必须完成邮箱验证</span>
                  </div>
                  <div className="kv">
                    <span className="k">审核方式</span>
                    <span className="v">符合资格自动通过</span>
                  </div>
                  <div className="kv">
                    <span className="k">参赛范围</span>
                    <span className="v">该赛季全部符合条件的正式比赛</span>
                  </div>
                  <div className="kv">
                    <span className="k">证据要求</span>
                    <span className="v">每场赛后 1 小时内提交日志与回放</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export function RegisterPage() {
  return (
    <RequireLogin>
      <RegisterInner />
    </RequireLogin>
  );
}
