import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { del, get, patch, post, put, toList } from '../../lib/api';
import { useAction } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import {
  Alert,
  Badge,
  Btn,
  Card,
  CardHead,
  Empty,
  Field,
  JsonBlock,
  Loading,
  Modal,
  PageHead,
} from '../../components/ui';
import { SEASON_STATE, SEASON_STATE_BADGE, SEASON_STATE_OPTIONS, label, badge } from '../../lib/labels';
import { fmtDateTime, fmtRange, fromInput, toDateTimeInput } from '../../lib/format';
import type { RegistrationField, Season, SeasonDetail } from '../../types';

interface FieldForm {
  id?: number;
  key: string;
  label: string;
  type: RegistrationField['type'];
  required: boolean;
  options: string;
  sortOrder: number;
}

const EMPTY_FIELD: FieldForm = { key: '', label: '', type: 'text', required: false, options: '', sortOrder: 0 };

export function AdminSeasonEditPage() {
  const { id } = useParams<{ id: string }>();
  const seasonId = Number(id);
  const { isSuper } = useAuth();
  const act = useAction();
  const [form, setForm] = useState({
    name: '',
    description: '',
    startAt: '',
    endAt: '',
    initialPoints: 60,
    minPoints: 0,
    winPoints: 5,
    lossPoints: -5,
    drawPoints: 0,
    registrationOpen: true,
    rewardNote: '',
  });
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rulesText, setRulesText] = useState('');
  const [rulesNote, setRulesNote] = useState('');
  const [savingRules, setSavingRules] = useState(false);
  const [fields, setFields] = useState<RegistrationField[]>([]);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [fieldForm, setFieldForm] = useState<FieldForm>(EMPTY_FIELD);
  const [fieldBusy, setFieldBusy] = useState(false);

  const { data: adminSeasons } = useQuery({
    queryKey: ['admin', 'seasons', 'all'],
    queryFn: async () => toList<Season>(await get('/admin/seasons', { page: 1, pageSize: 100 })),
  });

  const season = adminSeasons?.items.find((s) => s.id === seasonId);

  const { data: publicDetail } = useQuery({
    queryKey: ['season', seasonId],
    queryFn: () => get<SeasonDetail>(`/seasons/${seasonId}`),
    retry: false,
  });

  const { data: adminFields, refetch: refetchFields } = useQuery({
    queryKey: ['admin', 'season', seasonId, 'fields'],
    queryFn: async () => {
      const res = await get<{ items?: RegistrationField[] } | RegistrationField[]>(`/admin/seasons/${seasonId}/fields`);
      return Array.isArray(res) ? res : res.items ?? [];
    },
    enabled: isSuper && Number.isFinite(seasonId),
    retry: false,
  });

  useEffect(() => {
    if (season && !initialized) {
      setForm({
        name: season.name ?? '',
        description: season.description ?? '',
        startAt: toDateTimeInput(season.startAt),
        endAt: toDateTimeInput(season.endAt),
        initialPoints: season.initialPoints ?? 60,
        minPoints: season.minPoints ?? 0,
        winPoints: season.winPoints ?? 5,
        lossPoints: season.lossPoints ?? -5,
        drawPoints: season.drawPoints ?? 0,
        registrationOpen: season.registrationOpen !== false,
        rewardNote: season.rewardNote ?? '',
      });
      setInitialized(true);
    }
  }, [season, initialized]);

  useEffect(() => {
    if (publicDetail?.rules?.payload) {
      try {
        setRulesText(JSON.stringify(publicDetail.rules.payload, null, 2));
      } catch {
        setRulesText('');
      }
    }
  }, [publicDetail]);

  useEffect(() => {
    if (adminFields) setFields(adminFields);
  }, [adminFields]);

  const save = async () => {
    setSaving(true);
    await act(
      () =>
        patch(`/admin/seasons/${seasonId}`, {
          name: form.name,
          description: form.description,
          startAt: fromInput(form.startAt),
          endAt: fromInput(form.endAt),
          initialPoints: Number(form.initialPoints),
          minPoints: Number(form.minPoints),
          winPoints: Number(form.winPoints),
          lossPoints: Number(form.lossPoints),
          drawPoints: Number(form.drawPoints),
          registrationOpen: form.registrationOpen,
          rewardNote: form.rewardNote,
        }),
      { success: '赛季已更新', invalidate: [['admin', 'seasons'], ['season', seasonId], ['seasons', 'list']] },
    );
    setSaving(false);
  };

  const saveRules = async () => {
    let payload: unknown;
    try {
      payload = rulesText.trim() ? JSON.parse(rulesText) : {};
    } catch {
      alert('规则 JSON 格式错误，请检查后重试');
      return;
    }
    setSavingRules(true);
    const ok = await act(() => put(`/admin/seasons/${seasonId}/rules`, { payload, note: rulesNote }), {
      success: '规则版本已保存',
      invalidate: [['season', seasonId]],
    });
    setSavingRules(false);
    if (ok) setRulesNote('');
  };

  const transition = async (state: string) => {
    if (!state) return;
    if (state === 'sealed' && !window.confirm('封存赛季会冻结最终积分与排名，之后不允许常规成绩修改。确认封存？')) return;
    await act(() => post(`/admin/seasons/${seasonId}/state`, { state }), {
      success: `赛季状态已更新为「${label(SEASON_STATE, state)}」`,
      invalidate: [['admin', 'seasons'], ['season', seasonId], ['seasons', 'list']],
    });
  };

  const openField = (f?: RegistrationField) => {
    if (f) {
      setFieldForm({
        id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: !!f.required,
        options: (f.options ?? []).join('\n'),
        sortOrder: f.sortOrder ?? 0,
      });
    } else {
      setFieldForm(EMPTY_FIELD);
    }
    setFieldOpen(true);
  };

  const saveField = async () => {
    if (!fieldForm.key.trim() || !fieldForm.label.trim()) return;
    const body = {
      key: fieldForm.key.trim(),
      label: fieldForm.label.trim(),
      type: fieldForm.type,
      required: fieldForm.required,
      options: fieldForm.options
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      sortOrder: Number(fieldForm.sortOrder),
    };
    setFieldBusy(true);
    const ok = await act(
      () =>
        fieldForm.id
          ? patch(`/admin/seasons/${seasonId}/fields/${fieldForm.id}`, body)
          : post(`/admin/seasons/${seasonId}/fields`, body),
      { success: fieldForm.id ? '字段已更新' : '字段已添加', invalidate: [['admin', 'season', seasonId, 'fields']] },
    );
    setFieldBusy(false);
    if (ok) {
      setFieldOpen(false);
      void refetchFields();
    }
  };

  const removeField = async (f: RegistrationField) => {
    if (!window.confirm(`确认删除字段「${f.label}」？已提交的报名数据不会被删除。`)) return;
    const ok = await act(() => del(`/admin/seasons/${seasonId}/fields/${f.id}`), {
      success: '字段已删除',
      invalidate: [['admin', 'season', seasonId, 'fields']],
    });
    if (ok) void refetchFields();
  };

  if (!season) {
    if (adminSeasons === undefined) return <Loading text="正在加载赛季…" />;
    return <Empty icon="◷" text="赛季不存在" extra="请从赛季管理列表进入。" />;
  }

  const sealed = season.state === 'sealed' || season.state === 'archived';

  return (
    <div>
      <PageHead
        title={`编辑赛季 · ${season.name}`}
        desc={
          <>
            <span className="tag" style={{ marginRight: 8 }}>{season.code || `#${season.id}`}</span>
            <Badge kind={badge(SEASON_STATE_BADGE, season.state)}>{label(SEASON_STATE, season.state)}</Badge>
            <span style={{ marginLeft: 10 }}>{fmtRange(season.startAt, season.endAt)}</span>
          </>
        }
        actions={
          <>
            {isSuper ? (
              <select className="select" style={{ width: 140, height: 34 }} value="" onChange={(e) => void transition(e.target.value)}>
                <option value="">状态流转…</option>
                {SEASON_STATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.value === season.state}>
                    {o.text}
                  </option>
                ))}
              </select>
            ) : null}
            <Link to="/admin/seasons" className="btn btn-ghost btn-sm">
              返回列表
            </Link>
          </>
        }
      />

      {sealed ? (
        <Alert kind="warn">
          该赛季已{label(SEASON_STATE, season.state)}。封存后历史成绩、积分与排名已冻结，仅允许有限的配置字段修改。如需调整历史成绩请使用申诉 / 纠错流程。
        </Alert>
      ) : null}

      <div className="grid grid-side mt-16">
        <div className="stack">
          <Card>
            <CardHead title="基本信息" extra={!isSuper ? <span className="dim" style={{ fontSize: 12 }}>只读（需超管）</span> : null} />
            <div className="card-body">
              <div className="form-grid">
                <Field label="赛季名称" required>
                  <input
                    className="input"
                    value={form.name}
                    disabled={!isSuper}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="赛季编号">
                  <input className="input" value={season.code ?? ''} disabled />
                </Field>
                <div className="full">
                  <Field label="赛季介绍">
                    <textarea
                      className="textarea"
                      value={form.description}
                      disabled={!isSuper}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="开始时间">
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.startAt}
                    disabled={!isSuper}
                    onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                  />
                </Field>
                <Field label="结束时间">
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.endAt}
                    disabled={!isSuper}
                    onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                  />
                </Field>
                <Field label="初始积分">
                  <input
                    className="input"
                    type="number"
                    value={form.initialPoints}
                    disabled={!isSuper}
                    onChange={(e) => setForm({ ...form, initialPoints: Number(e.target.value) })}
                  />
                </Field>
                <Field label="积分下限">
                  <input
                    className="input"
                    type="number"
                    value={form.minPoints}
                    disabled={!isSuper}
                    onChange={(e) => setForm({ ...form, minPoints: Number(e.target.value) })}
                  />
                </Field>
                <Field label="胜利积分">
                  <input
                    className="input"
                    type="number"
                    value={form.winPoints}
                    disabled={!isSuper}
                    onChange={(e) => setForm({ ...form, winPoints: Number(e.target.value) })}
                  />
                </Field>
                <Field label="失败积分">
                  <input
                    className="input"
                    type="number"
                    value={form.lossPoints}
                    disabled={!isSuper}
                    onChange={(e) => setForm({ ...form, lossPoints: Number(e.target.value) })}
                  />
                </Field>
                <Field label="平局积分">
                  <input
                    className="input"
                    type="number"
                    value={form.drawPoints}
                    disabled={!isSuper}
                    onChange={(e) => setForm({ ...form, drawPoints: Number(e.target.value) })}
                  />
                </Field>
                <Field label="报名开放">
                  <label className="check" style={{ height: 40 }}>
                    <input
                      type="checkbox"
                      checked={form.registrationOpen}
                      disabled={!isSuper}
                      onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked })}
                    />
                    允许报名
                  </label>
                </Field>
                <div className="full">
                  <Field label="奖励说明">
                    <textarea
                      className="textarea"
                      value={form.rewardNote}
                      disabled={!isSuper}
                      onChange={(e) => setForm({ ...form, rewardNote: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
              {isSuper ? (
                <div className="row mt-16">
                  <Btn variant="primary" loading={saving} onClick={() => void save()}>
                    保存修改
                  </Btn>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHead
              title="自定义报名字段"
              extra={
                isSuper ? (
                  <Btn size="sm" variant="outline" onClick={() => openField()}>
                    添加字段
                  </Btn>
                ) : (
                  <span className="dim" style={{ fontSize: 12 }}>需超管</span>
                )
              }
            />
            {!fields.length ? (
              <Empty text="本赛季没有自定义报名字段" extra="报名时仅需填写游戏 ID。" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>类型</th>
                      <th>必填</th>
                      <th>选项</th>
                      <th>排序</th>
                      <th className="right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <div style={{ color: 'var(--text)' }}>{f.label}</div>
                          <div className="dim mono" style={{ fontSize: 11 }}>{f.key}</div>
                        </td>
                        <td>{f.type}</td>
                        <td>{f.required ? <Badge kind="purple">必填</Badge> : '选填'}</td>
                        <td className="dim truncate" style={{ maxWidth: 220 }}>
                          {(f.options ?? []).join(' / ') || '—'}
                        </td>
                        <td className="num">{f.sortOrder ?? 0}</td>
                        <td className="right">
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            <Btn size="sm" variant="ghost" onClick={() => openField(f)}>
                              编辑
                            </Btn>
                            <Btn size="sm" variant="danger" onClick={() => void removeField(f)}>
                              删除
                            </Btn>
                          </div>
                        </td>
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
            <CardHead
              title="赛季规则版本"
              extra={publicDetail?.rules?.version ? <span className="tag">当前 v{publicDetail.rules.version}</span> : null}
            />
            <div className="card-body">
              {!isSuper ? (
                publicDetail?.rules?.payload ? (
                  <JsonBlock value={publicDetail.rules.payload} />
                ) : (
                  <Empty text="暂无规则版本" />
                )
              ) : (
                <div className="stack">
                  <Alert kind="info">保存规则会写入新的版本记录（season_rules），历史版本永久保留，不会影响已封存赛季。</Alert>
                  <Field label="规则 JSON" hint="写入 season_rules.payload；前台赛季详情会展示其中的标量字段">
                    <textarea
                      className="textarea mono"
                      style={{ minHeight: 180 }}
                      value={rulesText}
                      placeholder={'{\n  "说明": "赛季规则文本",\n  "证据要求": "赛后 1 小时内提交"\n}'}
                      onChange={(e) => setRulesText(e.target.value)}
                    />
                  </Field>
                  <Field label="版本备注">
                    <input className="input" value={rulesNote} onChange={(e) => setRulesNote(e.target.value)} />
                  </Field>
                  <Btn variant="primary" loading={savingRules} onClick={() => void saveRules()}>
                    保存新规则版本
                  </Btn>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="赛季信息" />
            <div className="card-body tight">
              <div className="kv-list">
                <div className="kv">
                  <span className="k">赛季 ID</span>
                  <span className="v mono">{season.id}</span>
                </div>
                <div className="kv">
                  <span className="k">报名人数</span>
                  <span className="v num">{season.registrationCount ?? publicDetail?.registrationCount ?? 0}</span>
                </div>
                <div className="kv">
                  <span className="k">封存时间</span>
                  <span className="v">{season.sealedAt ? fmtDateTime(season.sealedAt) : '未封存'}</span>
                </div>
                <div className="kv">
                  <span className="k">创建时间</span>
                  <span className="v">{fmtDateTime(season.createdAt)}</span>
                </div>
                <div className="kv">
                  <span className="k">更新时间</span>
                  <span className="v">{fmtDateTime(season.updatedAt)}</span>
                </div>
              </div>
              <div className="divider" />
              <Link to={`/seasons/${season.id}`} className="btn btn-ghost btn-sm btn-block">
                查看前台赛季页
              </Link>
              <Link to={`/admin/registrations?seasonId=${season.id}`} className="btn btn-ghost btn-sm btn-block mt-8">
                管理本赛季报名
              </Link>
              <Link to={`/admin/matches?seasonId=${season.id}`} className="btn btn-ghost btn-sm btn-block mt-8">
                管理本赛季比赛
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={fieldOpen}
        title={fieldForm.id ? '编辑报名字段' : '添加报名字段'}
        onClose={() => setFieldOpen(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setFieldOpen(false)}>
              取消
            </Btn>
            <Btn variant="primary" loading={fieldBusy} onClick={() => void saveField()}>
              保存
            </Btn>
          </>
        }
      >
        <div className="form-grid">
          <Field label="字段键名" required hint="英文/下划线，赛季内唯一，如 qq">
            <input
              className="input"
              value={fieldForm.key}
              disabled={!!fieldForm.id}
              onChange={(e) => setFieldForm({ ...fieldForm, key: e.target.value })}
            />
          </Field>
          <Field label="显示名称" required>
            <input
              className="input"
              value={fieldForm.label}
              onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })}
            />
          </Field>
          <Field label="字段类型">
            <select
              className="select"
              value={fieldForm.type}
              onChange={(e) => setFieldForm({ ...fieldForm, type: e.target.value as RegistrationField['type'] })}
            >
              <option value="text">单行文本</option>
              <option value="textarea">多行文本</option>
              <option value="number">数字</option>
              <option value="select">单选下拉</option>
              <option value="checkbox">勾选确认</option>
            </select>
          </Field>
          <Field label="排序">
            <input
              className="input"
              type="number"
              value={fieldForm.sortOrder}
              onChange={(e) => setFieldForm({ ...fieldForm, sortOrder: Number(e.target.value) })}
            />
          </Field>
          <div className="full">
            <Field label="下拉选项（每行一个，仅 select 使用）">
              <textarea
                className="textarea"
                value={fieldForm.options}
                onChange={(e) => setFieldForm({ ...fieldForm, options: e.target.value })}
              />
            </Field>
          </div>
          <div className="full">
            <label className="check">
              <input
                type="checkbox"
                checked={fieldForm.required}
                onChange={(e) => setFieldForm({ ...fieldForm, required: e.target.checked })}
              />
              必填字段
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
