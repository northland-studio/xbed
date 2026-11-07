import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post, put } from '../../lib/api';
import { useAction } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import {
  Alert,
  Badge,
  Btn,
  Card,
  CardHead,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHead,
} from '../../components/ui';
import type { SmtpSettings } from '../../types';

export function AdminSmtpPage() {
  const { isSuper } = useAuth();
  const act = useAction();
  const [form, setForm] = useState({
    host: '',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    fromName: 'XBed 赛事平台',
    fromEmail: '',
  });
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'smtp'],
    queryFn: () => get<SmtpSettings>('/admin/settings/smtp'),
    enabled: isSuper,
    retry: false,
  });

  useEffect(() => {
    if (data && !initialized) {
      setForm({
        host: data.host ?? '',
        port: data.port ?? 465,
        secure: data.secure !== false,
        user: data.user ?? '',
        pass: '',
        fromName: data.fromName ?? 'XBed 赛事平台',
        fromEmail: data.fromEmail ?? '',
      });
      setInitialized(true);
    }
  }, [data, initialized]);

  const save = async () => {
    if (!form.host.trim() || !form.user.trim()) return;
    setSaving(true);
    const ok = await act(
      () =>
        put('/admin/settings/smtp', {
          host: form.host.trim(),
          port: Number(form.port),
          secure: form.secure,
          user: form.user.trim(),
          pass: form.pass || undefined,
          fromName: form.fromName.trim(),
          fromEmail: form.fromEmail.trim(),
        }),
      { success: 'SMTP 配置已保存（密码加密存储）', invalidate: [['admin', 'smtp']] },
    );
    setSaving(false);
    if (ok) {
      setForm({ ...form, pass: '' });
      void refetch();
      setInitialized(false);
    }
  };

  const test = async () => {
    setTesting(true);
    await act(() => post('/admin/settings/smtp/test', testTo.trim() ? { to: testTo.trim() } : {}), {
      success: '测试邮件已发送，请检查收件箱与发件日志',
    });
    setTesting(false);
  };

  if (!isSuper) {
    return (
      <div>
        <PageHead title="邮件配置" desc="SMTP 邮件发送配置。" />
        <Empty icon="✉" text="需要超级管理员权限" extra="邮件配置涉及凭据，仅对 Lv.2 超级管理员开放。" />
      </div>
    );
  }

  return (
    <div>
      <PageHead
        title="邮件配置"
        desc="XBed 独立配置 SMTP 发送邮件（邮箱验证码、赛事通知）。密码使用 AES 加密存储，接口只返回脱敏状态。"
        actions={
          data?.configured ? <Badge kind="green">已配置</Badge> : <Badge kind="yellow">未配置</Badge>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Loading />
      ) : (
        <div className="grid grid-side">
          <Card>
            <CardHead title="SMTP 参数" />
            <div className="card-body">
              <div className="form-grid">
                <Field label="SMTP 服务器" required hint="如 smtp.example.com">
                  <input className="input" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
                </Field>
                <Field label="端口" required hint="SSL 常用 465，STARTTLS 常用 587">
                  <input
                    className="input"
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                  />
                </Field>
                <Field label="SSL / 加密连接">
                  <label className="check" style={{ height: 40 }}>
                    <input
                      type="checkbox"
                      checked={form.secure}
                      onChange={(e) => setForm({ ...form, secure: e.target.checked })}
                    />
                    使用 SSL/TLS
                  </label>
                </Field>
                <Field label="SMTP 账号" required>
                  <input className="input" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
                </Field>
                <Field label="SMTP 密码" hint={data?.passMasked ? `当前已保存：${data.passMasked}（留空则不修改）` : '未设置密码'}>
                  <input
                    className="input"
                    type="password"
                    placeholder={data?.passMasked ? '••••••••（留空保持不变）' : '输入密码'}
                    value={form.pass}
                    onChange={(e) => setForm({ ...form, pass: e.target.value })}
                  />
                </Field>
                <Field label="发件人名称">
                  <input className="input" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
                </Field>
                <Field label="发件人邮箱" hint="默认与 SMTP 账号一致">
                  <input className="input" type="email" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} />
                </Field>
              </div>
              <div className="row mt-16">
                <Btn variant="primary" loading={saving} onClick={() => void save()}>
                  保存配置
                </Btn>
              </div>
            </div>
          </Card>

          <div className="stack">
            <Card>
              <CardHead title="发送测试邮件" />
              <div className="card-body">
                <div className="stack">
                  <Field label="收件邮箱" hint="留空则发送到当前管理员账号已验证邮箱">
                    <input className="input" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  </Field>
                  <Btn variant="outline" loading={testing} onClick={() => void test()}>
                    发送测试邮件
                  </Btn>
                  <p className="dim" style={{ fontSize: 11.5, lineHeight: 1.8 }}>
                    邮件发送状态与失败原因会记录在 email_logs 中，可在数据库 / 审计中排查。
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <CardHead title="当前状态" />
              <div className="card-body tight">
                <div className="kv-list">
                  <div className="kv">
                    <span className="k">配置状态</span>
                    <span className="v">{data?.configured ? <Badge kind="green">已配置</Badge> : <Badge kind="yellow">未配置</Badge>}</span>
                  </div>
                  <div className="kv">
                    <span className="k">服务器</span>
                    <span className="v">{data?.host || '—'}</span>
                  </div>
                  <div className="kv">
                    <span className="k">端口 / SSL</span>
                    <span className="v">
                      {data?.port ?? '—'} / {data?.secure ? '是' : '否'}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="k">账号</span>
                    <span className="v">{data?.user || '—'}</span>
                  </div>
                  <div className="kv">
                    <span className="k">密码</span>
                    <span className="v">{data?.passMasked || '未设置'}</span>
                  </div>
                  <div className="kv">
                    <span className="k">发件人</span>
                    <span className="v">{data?.fromName || '—'} &lt;{data?.fromEmail || data?.user || '—'}&gt;</span>
                  </div>
                </div>
                <Alert kind="info">
                  敏感凭据仅加密保存在服务端环境 / 数据库中，前端永远无法读取明文密码。保存配置与测试发送均写入审计。
                </Alert>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
