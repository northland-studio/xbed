import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { get } from '../lib/api';
import { Btn } from '../components/ui';
import type { SessionInfo } from '../types';

/** OAuth 回调中转页：服务端完成 code→token→session 后 302 回前端，这里处理 ?auth=ok/error */
export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  const auth = params.get('auth');
  const reason = params.get('message') || params.get('reason') || params.get('error') || '';

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      if (auth === 'error') {
        setStatus('error');
        setMessage(reason || '授权失败，可能是登录已过期、state 校验失败或你不是玄剑公会成员。');
        return;
      }
      try {
        const session = await get<SessionInfo>('/auth/me', undefined, { silent: true, skipAuthRedirect: true });
        await refetch();
        if (session?.user) {
          setStatus('ok');
          const saved = sessionStorage.getItem('xbed_login_redirect');
          sessionStorage.removeItem('xbed_login_redirect');
          const target = saved && saved.startsWith('/') ? saved : '/me';
          window.setTimeout(() => navigate(target, { replace: true }), 700);
        } else {
          setStatus('error');
          setMessage('登录回调成功，但未能建立会话。请重试登录；若持续失败请联系管理员。');
        }
      } catch {
        setStatus('error');
        setMessage('登录状态校验失败，请重新登录。');
      }
    };

    void run();
  }, [auth, reason, refetch, navigate]);

  return (
    <div className="login-wrap">
      <div className="geo" style={{ opacity: 0.6 }}>
        <div className="geo-lines" />
        <div className="geo-slash s1" />
        <div className="geo-slash s3" />
      </div>
      <div className="login-card">
        <img className="hero-logo" src="/logo.png" alt="XBed Logo" />
        {status === 'loading' ? (
          <>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <h1 className="login-title">正在完成登录…</h1>
            <p className="login-desc">正在校验玄剑 OAuth 授权与会话状态，请稍候。</p>
          </>
        ) : status === 'ok' ? (
          <>
            <h1 className="login-title">登录成功</h1>
            <p className="login-desc">已建立 XBed 登录态，正在跳转…</p>
            <Link to="/me" className="btn btn-primary btn-block">
              进入个人中心
            </Link>
          </>
        ) : (
          <>
            <h1 className="login-title">登录失败</h1>
            <p className="login-desc">{message}</p>
            <div className="stack">
              <Btn variant="primary" block onClick={() => navigate('/login', { replace: true })}>
                重新登录
              </Btn>
              <Link to="/" className="btn btn-ghost btn-block">
                返回首页
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
