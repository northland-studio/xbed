import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, put } from '../../lib/api';
import { useAction } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import {
  Alert,
  Btn,
  Card,
  CardHead,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHead,
} from '../../components/ui';
import type { SystemSetting } from '../../types';

interface SettingDef {
  key: string;
  label: string;
  desc?: string;
  type: 'text' | 'number' | 'boolean';
}

const DEFS: SettingDef[] = [
  { key: 'site_name', label: '站点名称', desc: '展示在页面标题与邮件模板中', type: 'text' },
  { key: 'registration_need_email', label: '报名需邮箱验证', desc: '1 开启 / 0 关闭；关闭后未验证邮箱也可报名（不建议）', type: 'boolean' },
  { key: 'evidence_deadline_minutes', label: '证据提交截止（分钟）', desc: '比赛结束后多少分钟内提交 latest.log / .mcpr', type: 'number' },
  { key: 'appeal_deadline_hours', label: '申诉截止（小时）', desc: '正式赛果公布后可申诉时长', type: 'number' },
  { key: 'team_create_enabled', label: '允许创建战队', desc: '1 允许 / 0 关闭；关闭后只能通过队长邀请加入', type: 'boolean' },
  { key: 'team_min_members', label: '战队最低人数', type: 'number' },
  { key: 'team_max_members', label: '战队最高人数', desc: '降低上限不会自动踢出现有成员', type: 'number' },
  { key: 'upload_max_latest_log_mb', label: 'latest.log 大小上限（MB）', type: 'number' },
  { key: 'upload_max_mcpr_mb', label: '.mcpr 回放大小上限（MB）', type: 'number' },
];

export function AdminSettingsPage() {
  const { isSuper } = useAuth();
  const act = useAction();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const res = await get<{ items?: SystemSetting[]; settings?: Record<string, string> }>('/admin/settings');
      const map: Record<string, string> = {};
      if (res.settings && typeof res.settings === 'object') {
        Object.entries(res.settings).forEach(([k, v]) => {
          map[k] = String(v ?? '');
        });
      }
      (res.items ?? []).forEach((it) => {
        map[it.key] = it.value ?? '';
      });
      return map;
    },
    enabled: isSuper,
    retry: false,
  });

  useEffect(() => {
    if (data) setValues(data);
  }, [data]);

  const extraKeys = useMemo(() => {
    if (!data) return [];
    return Object.keys(data).filter((k) => !DEFS.some((d) => d.key === k));
  }, [data]);

  const save = async () => {
    setSaving(true);
    const items = Object.entries(values).map(([key, value]) => ({ key, value }));
    const ok = await act(() => put('/admin/settings', { items, settings: values }), {
      success: '系统设置已保存',
      invalidate: [['admin', 'settings'], ['admin', 'overview']],
    });
    setSaving(false);
    if (ok) void refetch();
  };

  if (!isSuper) {
    return (
      <div>
        <PageHead title="系统设置" desc="系统运行参数配置。" />
        <Empty icon="⚙" text="需要超级管理员权限" extra="系统设置仅对 Lv.2 超级管理员开放。" />
      </div>
    );
  }
  if (isLoading) return <Loading text="正在加载系统设置…" />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHead
        title="系统设置"
        desc="修改运行参数（报名字段要求、证据截止、战队人数、上传大小上限等）。修改即时生效并写入审计日志。"
        actions={
          <Btn variant="primary" size="sm" loading={saving} onClick={() => void save()}>
            保存设置
          </Btn>
        }
      />

      <Alert kind="info">
        SMTP 邮件配置请在「邮件配置」页面维护；敏感凭据不会在本页展示。修改上传限制与截止时间需与服务器插件 / 前端提示保持一致。
      </Alert>

      <div className="grid grid-side mt-16">
        <Card>
          <CardHead title="运行参数" />
          <div className="card-body">
            <div className="form-grid">
              {DEFS.map((d) => {
                const current = values[d.key] ?? '';
                return (
                  <Field key={d.key} label={d.label} hint={d.desc}>
                    {d.type === 'boolean' ? (
                      <label className="check" style={{ height: 40 }}>
                        <input
                          type="checkbox"
                          checked={current === '1' || current === 'true'}
                          onChange={(e) => setValues((prev) => ({ ...prev, [d.key]: e.target.checked ? '1' : '0' }))}
                        />
                        启用
                      </label>
                    ) : (
                      <input
                        className="input"
                        type={d.type === 'number' ? 'number' : 'text'}
                        value={current}
                        onChange={(e) => setValues((prev) => ({ ...prev, [d.key]: e.target.value }))}
                      />
                    )}
                  </Field>
                );
              })}
              {extraKeys.map((k) => (
                <Field key={k} label={k}>
                  <input
                    className="input"
                    value={values[k] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [k]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
            <div className="row mt-16">
              <Btn variant="primary" loading={saving} onClick={() => void save()}>
                保存设置
              </Btn>
              <Btn variant="ghost" onClick={() => void refetch()}>
                重新读取
              </Btn>
            </div>
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHead title="设置说明" />
            <div className="card-body tight">
              <div className="kv-list">
                <div className="kv">
                  <span className="k">数据表</span>
                  <span className="v mono">system_settings</span>
                </div>
                <div className="kv">
                  <span className="k">配置键数量</span>
                  <span className="v num">{Object.keys(values).length}</span>
                </div>
                <div className="kv">
                  <span className="k">敏感键</span>
                  <span className="v">本接口不返回 SMTP 等敏感值</span>
                </div>
              </div>
              <div className="divider" />
              <p className="dim" style={{ fontSize: 11.5, lineHeight: 1.8 }}>
                提示：S1 的积分规则固定为胜 +5 / 负 −5 / 平 0，不在系统设置中开放倍率配置；赛季级别的积分参数在「赛季管理」中维护。
              </p>
            </div>
          </Card>

          <Card>
            <CardHead title="运维相关入口" />
            <div className="card-body tight">
              <div className="stack-sm">
                <a href="/admin/files" className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between' }}>
                  文件与存储管理 <span className="dim">空间统计</span>
                </a>
                <a href="/admin/servers" className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between' }}>
                  服务器 API 密钥 <span className="dim">轮换 / 吊销</span>
                </a>
                <a href="/admin/audit" className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between' }}>
                  操作审计 <span className="dim">只读</span>
                </a>
                <a href="/admin/overview" className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between' }}>
                  后台总览 <span className="dim">运行状态</span>
                </a>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
