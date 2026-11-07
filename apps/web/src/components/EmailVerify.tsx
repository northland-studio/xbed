import { useEffect, useState } from 'react';
import { post } from '../lib/api';
import { useToast } from '../lib/toast';
import { Alert, Btn, Field } from './ui';

/**
 * 邮箱验证组件：发送验证码 + 提交验证码
 * 邮箱仅用于 XBed 站内验证与通知，不作为登录账号，也不向其他玩家公开。
 */
export function EmailVerifyBox({
  currentEmail,
  verified,
  onDone,
}: {
  currentEmail?: string | null;
  verified?: boolean;
  onDone?: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState(currentEmail ?? '');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setEmail(currentEmail ?? '');
  }, [currentEmail]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (verified) {
    return (
      <Alert kind="ok">
        邮箱已验证{currentEmail ? `：${currentEmail}` : ''}。如更换邮箱需重新验证，但不会自动取消已有的参赛资格。
      </Alert>
    );
  }

  const send = async () => {
    const target = email.trim();
    if (!target) {
      toast.error('请先填写邮箱地址');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      toast.error('邮箱格式不正确');
      return;
    }
    setSending(true);
    try {
      await post('/me/email/send', { email: target });
      toast.success('验证码已发送，请查收邮件（有效期 15 分钟，1 小时内最多 8 次）');
      setSent(true);
      setCooldown(60);
    } catch {
      /* 错误已由全局 toast 提示 */
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (!code.trim()) {
      toast.error('请输入验证码');
      return;
    }
    setVerifying(true);
    try {
      await post('/me/email/verify', { email: email.trim(), code: code.trim() });
      toast.success('邮箱验证成功');
      setCode('');
      setSent(false);
      onDone?.();
    } catch {
      /* 错误已由全局 toast 提示 */
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="stack">
      <Alert kind="warn">
        邮箱尚未验证。验证完成前无法报名参赛。邮箱不用于登录，也不会向其他玩家公开。
      </Alert>
      <div className="stack">
        <Field label="邮箱地址" required hint="用于接收赛事通知与验证码">
          <input
            className="input"
            type="email"
            value={email}
            placeholder="name@example.com"
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="验证码" required hint={sent ? '验证码已发送，请填写 6 位数字' : '点击下方按钮获取验证码'}>
          <input
            className="input"
            value={code}
            placeholder="6 位验证码"
            inputMode="numeric"
            onChange={(e) => setCode(e.target.value)}
          />
          <Btn
            variant="outline"
            onClick={() => void send()}
            loading={sending}
            disabled={cooldown > 0}
            className="nowrap"
            block
          >
            {cooldown > 0 ? `${cooldown}s 后重发` : '发送验证码'}
          </Btn>
        </Field>
      </div>
      <div className="row">
        <Btn variant="primary" onClick={() => void verify()} loading={verifying}>
          提交验证
        </Btn>
        <span className="dim" style={{ fontSize: 12 }}>
          接收频率限制：60 秒 / 次，1 小时内最多 8 次
        </span>
      </div>
    </div>
  );
}
