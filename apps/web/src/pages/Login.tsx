import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Alert } from '../components/ui';

const MOCK_LEVELS = [
  { level: 0, label: '成员 L0' },
  { level: 1, label: '管理员 L1' },
  { level: 2, label: '超级管理员 L2' },
];

export function LoginPage() {
  const [params] = useSearchParams();
  const { isLoggedIn, user, logout } = useAuth();
  const redirect = params.get('redirect') || '/';
  const [mockLevel, setMockLevel] = useState(0);
  const dev = import.meta.env.DEV;

  const loginHref = `/api/auth/login?redirect=${encodeURIComponent(redirect)}`;

  return (
    <div className="login-wrap">
      <div className="geo" style={{ opacity: 0.7 }}>
        <div className="geo-lines" />
        <div className="geo-lines cyan" />
        <div className="geo-slash s1" />
        <div className="geo-slash s3" />
      </div>

      <div className="login-card">
        <img className="hero-logo" src="/logo.png" alt="XBed Logo" />
        <h1 className="login-title">登录 XBed</h1>
        <p className="login-desc">
          XBed 不提供独立账号密码。请使用玄剑官网账号通过 OAuth 2.0 授权登录。
          仅玄剑公会成员（且等级不为 -1）可以建立登录态。
        </p>

        {isLoggedIn ? (
          <>
            <Alert kind="ok">
              你已登录：{user?.nickname || user?.username}
              {typeof user?.level === 'number' ? `（Lv.${user.level}）` : ''}
            </Alert>
            <div className="stack mt-16">
              <Link to={redirect} className="btn btn-primary btn-block">
                继续访问
              </Link>
              <Link to="/me" className="btn btn-outline btn-block">
                进入个人中心
              </Link>
              <button className="btn btn-ghost btn-block" onClick={() => void logout()}>
                退出当前账号
              </button>
            </div>
          </>
        ) : (
          <>
            <a href={loginHref} className="btn btn-primary btn-lg btn-block">
              使用玄剑账号登录
            </a>
            <p className="login-note">
              登录即表示同意授权 XBed 读取你的玄剑用户名、昵称、头像、等级、称号、贡献点与成员身份。
              上述资料由玄剑官网管理，XBed 不允许自行修改。邮箱需在 XBed 内单独填写并验证。
            </p>

            {dev ? (
              <div className="mt-24" style={{ borderTop: '1px dashed var(--border-soft)', paddingTop: 18 }}>
                <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
                  开发环境模拟登录（仅 NODE_ENV≠production 且 OAUTH_MOCK=1 时后端提供，生产构建不包含）
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <select
                    className="select input-sm"
                    style={{ flex: 1 }}
                    value={mockLevel}
                    onChange={(e) => setMockLevel(Number(e.target.value))}
                  >
                    {MOCK_LEVELS.map((m) => (
                      <option key={m.level} value={m.level}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <a
                    className="btn btn-outline btn-sm"
                    href={`/api/auth/mock-login?userId=dev-user&level=${mockLevel}&redirect=${encodeURIComponent('/auth/callback?auth=ok')}`}
                  >
                    模拟登录
                  </a>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
