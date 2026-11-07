import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Avatar, Btn, Empty } from './ui';

interface AdminNavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  superOnly?: boolean;
}

interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    title: '总览',
    items: [{ to: '/admin', label: '后台总览', icon: '◈', end: true }],
  },
  {
    title: '赛事管理',
    items: [
      { to: '/admin/seasons', label: '赛季管理', icon: '◷' },
      { to: '/admin/registrations', label: '报名管理', icon: '✎' },
      { to: '/admin/matches', label: '比赛管理', icon: '⚔' },
      { to: '/admin/points', label: '积分管理', icon: '＋' },
      { to: '/admin/leaderboard', label: '排行榜 / 段位', icon: '▤' },
    ],
  },
  {
    title: '社区',
    items: [
      { to: '/admin/users', label: '用户管理', icon: '◎' },
      { to: '/admin/teams', label: '战队管理', icon: '⛨' },
      { to: '/admin/appeals', label: '申诉处理', icon: '✉' },
      { to: '/admin/announcements', label: '公告管理', icon: '☰' },
      { to: '/admin/notifications', label: '通知群发', icon: '✦', superOnly: true },
    ],
  },
  {
    title: '系统',
    items: [
      { to: '/admin/smtp', label: '邮件配置', icon: '✉', superOnly: true },
      { to: '/admin/servers', label: '服务器 API', icon: '⚙', superOnly: true },
      { to: '/admin/files', label: '文件管理', icon: '▣' },
      { to: '/admin/audit', label: '操作审计', icon: '☰', superOnly: true },
      { to: '/admin/settings', label: '系统设置', icon: '⚙', superOnly: true },
    ],
  },
];

const TITLE_MAP: { test: RegExp; title: string }[] = [
  { test: /^\/admin\/?$/, title: '后台总览' },
  { test: /^\/admin\/seasons\/\d+/, title: '赛季编辑' },
  { test: /^\/admin\/seasons/, title: '赛季管理' },
  { test: /^\/admin\/registrations/, title: '报名管理' },
  { test: /^\/admin\/matches\/\d+/, title: '赛果审核工作台' },
  { test: /^\/admin\/matches/, title: '比赛管理' },
  { test: /^\/admin\/points/, title: '积分管理' },
  { test: /^\/admin\/leaderboard/, title: '排行榜 / 段位配置' },
  { test: /^\/admin\/users/, title: '用户管理' },
  { test: /^\/admin\/teams/, title: '战队管理' },
  { test: /^\/admin\/appeals/, title: '申诉处理' },
  { test: /^\/admin\/announcements/, title: '公告管理' },
  { test: /^\/admin\/notifications/, title: '通知群发' },
  { test: /^\/admin\/smtp/, title: '邮件配置' },
  { test: /^\/admin\/servers/, title: '服务器 API 管理' },
  { test: /^\/admin\/files/, title: '文件管理' },
  { test: /^\/admin\/audit/, title: '操作审计' },
  { test: /^\/admin\/settings/, title: '系统设置' },
];

export function AdminLayout() {
  const { isLoggedIn, isAdmin, isSuper, isLoading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    }
  }, [isLoading, isLoggedIn, navigate, location]);

  if (isLoading) {
    return (
      <div className="state-box" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <div className="state-desc">正在校验管理权限…</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="state-box" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <div className="state-desc">正在跳转登录…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="state-box" style={{ minHeight: '100vh' }}>
        <div className="state-icon">🚫</div>
        <div className="state-title">无管理后台权限</div>
        <div className="state-desc">
          当前账号（Lv.{user?.level ?? 0}）不是管理员。管理后台仅对玄剑等级 ≥ 1 的管理员开放。
        </div>
        <Link to="/" className="btn btn-outline">
          返回首页
        </Link>
      </div>
    );
  }

  const title = TITLE_MAP.find((t) => t.test.test(location.pathname))?.title ?? '管理后台';

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar${open ? ' open' : ''}`}>
        <Link to="/" className="admin-brand">
          <img src="/logo.png" alt="XBed" />
          <span>
            <span className="t">XBED</span>
            <div className="s">ADMIN CONSOLE</div>
          </span>
        </Link>
        <nav className="admin-nav">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((it) => !it.superOnly || isSuper);
            if (!items.length) return null;
            return (
              <div key={group.title}>
                <div className="admin-group">{group.title}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `admin-navitem${isActive ? ' active' : ''}`}
                  >
                    <span className="ico">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="admin-side-foot">
          <div className="row" style={{ marginBottom: 10 }}>
            <Avatar src={user?.avatar} name={user?.nickname} size="sm" />
            <div className="avatar-name">
              <span className="n" style={{ fontSize: 13 }}>{user?.nickname || user?.username}</span>
              <span className="s">{isSuper ? '超级管理员 L2' : '管理员 L1'}</span>
            </div>
          </div>
          <Link to="/" className="btn btn-ghost btn-sm btn-block">
            返回前台
          </Link>
        </div>
      </aside>

      {open ? <div className="drawer-mask" style={{ zIndex: 79 }} onClick={() => setOpen(false)} /> : null}

      <div className="admin-main">
        <div className="admin-topbar">
          <button
            className="btn btn-ghost btn-icon admin-mobile-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label="切换菜单"
          >
            ☰
          </button>
          <div className="admin-title">{title}</div>
          <div className="spacer" />
          <span className="admin-crumb">{location.pathname}</span>
          <Btn size="sm" variant="ghost" onClick={() => navigate('/me')}>
            个人中心
          </Btn>
        </div>
        <div className="admin-content">
          {isSuper ? null : (
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <span className="alert-icon">i</span>
              <div>
                当前为 L1 管理员视图：赛季配置、段位配置、积分手动调整、SMTP、服务器密钥、通知群发、系统设置等
                超级管理员专属功能已隐藏。
              </div>
            </div>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function AdminForbidden() {
  return <Empty icon="🚫" text="权限不足" extra="该功能仅超级管理员（Lv.2）可用。" />;
}
