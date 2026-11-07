import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { get, toList } from '../lib/api';
import type { Notification, Paginated } from '../types';
import { Avatar, Btn } from './ui';

const NAV = [
  { to: '/', label: '首页', end: true },
  { to: '/seasons', label: '赛事中心' },
  { to: '/matches', label: '比赛' },
  { to: '/leaderboard', label: '排行榜' },
  { to: '/announcements', label: '公告' },
];

export function SiteHeader({ onToggleDrawer, unread }: { onToggleDrawer: () => void; unread: number }) {
  const { user, isLoggedIn, logout, isAdmin } = useAuth();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand" aria-label="XBed 首页">
          <img src="/logo.png" alt="XBed Logo" />
          <span className="brand-text">
            <span className="brand-name">XBED</span>
            <span className="brand-sub">玄剑起床战争挑战赛</span>
          </span>
        </Link>

        <nav className="nav" aria-label="主导航">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-right">
          {isLoggedIn ? (
            <>
              <Link to="/me/notifications" className="bell" aria-label="通知中心">
                ✉
                {unread > 0 ? <span className="bell-dot">{unread > 99 ? '99+' : unread}</span> : null}
              </Link>
              <Link to="/me" className="user-chip">
                <Avatar src={user?.avatar} name={user?.nickname || user?.username} size="sm" />
                <span className="user-chip-name truncate">{user?.nickname || user?.username}</span>
              </Link>
              {isAdmin ? (
                <Link to="/admin" className="btn btn-outline btn-sm desktop-only">
                  管理后台
                </Link>
              ) : null}
              <button className="btn btn-ghost btn-sm desktop-only" onClick={() => void logout()}>
                退出
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">
              玄剑账号登录
            </Link>
          )}
          <button className="burger" onClick={onToggleDrawer} aria-label="打开菜单">
            ☰
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="brand" style={{ marginBottom: 12 }}>
              <img src="/logo.png" alt="XBed Logo" />
              <span className="brand-text">
                <span className="brand-name">XBED</span>
                <span className="brand-sub">玄剑起床战争挑战赛</span>
              </span>
            </div>
            <p>
              XBed 是玄剑公会内部起床战争竞技赛事平台，以赛季积分、段位、排行榜与个人竞技档案构成可持续的线上竞技体系。
              S1 仅面向玄剑公会成员。
            </p>
            <p style={{ marginTop: 10 }}>开发：北域工作室 Northland Studio</p>
          </div>
          <div className="footer-links">
            <div className="footer-col">
              <h4>赛事</h4>
              <Link to="/seasons">赛事中心</Link>
              <Link to="/matches">比赛列表</Link>
              <Link to="/leaderboard">排行榜</Link>
            </div>
            <div className="footer-col">
              <h4>资讯</h4>
              <Link to="/announcements">赛事公告</Link>
              <Link to="/seasons">报名入口</Link>
            </div>
            <div className="footer-col">
              <h4>个人</h4>
              <Link to="/me">个人中心</Link>
              <Link to="/me/teams">我的战队</Link>
              <Link to="/me/appeals">我的申诉</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} XBed · 玄剑公会 保留所有权利</span>
          <span>本站仅支持简体中文 · 身份认证由玄剑官网 OAuth 2.0 提供</span>
        </div>
      </div>
    </footer>
  );
}

function Drawer({ open, onClose, unread }: { open: boolean; onClose: () => void; unread: number }) {
  const { isLoggedIn, user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!open) return null;
  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <span className="brand">
            <img src="/logo.png" alt="XBed" />
            <span className="brand-text">
              <span className="brand-name">XBED</span>
              <span className="brand-sub">S1 赛事平台</span>
            </span>
          </span>
          <button className="close-x" onClick={onClose} aria-label="关闭菜单">
            ✕
          </button>
        </div>
        <nav className="drawer-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `drawer-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
          {isLoggedIn ? (
            <>
              <div className="admin-group" style={{ paddingLeft: 8 }}>个人</div>
              <Link to="/me" className="drawer-link">
                个人中心
              </Link>
              <Link to="/me/notifications" className="drawer-link">
                通知中心 {unread > 0 ? <span className="badge badge-red">{unread}</span> : null}
              </Link>
              <Link to="/me/teams" className="drawer-link">
                我的战队
              </Link>
              <Link to="/me/appeals" className="drawer-link">
                我的申诉
              </Link>
              {isAdmin ? (
                <Link to="/admin" className="drawer-link">
                  管理后台
                </Link>
              ) : null}
            </>
          ) : null}
        </nav>
        <div className="drawer-foot">
          {isLoggedIn ? (
            <>
              <div className="row">
                <Avatar src={user?.avatar} name={user?.nickname} />
                <div className="avatar-name">
                  <span className="n">{user?.nickname || user?.username}</span>
                  <span className="s">Lv.{user?.level ?? 0} · 玄剑成员</span>
                </div>
              </div>
              <Btn variant="ghost" onClick={() => void logout()}>
                退出登录
              </Btn>
            </>
          ) : (
            <Btn variant="primary" onClick={() => navigate('/login')}>
              玄剑账号登录
            </Btn>
          )}
        </div>
      </aside>
    </>
  );
}

export function SiteLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { isLoggedIn } = useAuth();

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => {
      const res = await get<Paginated<Notification> & { unread?: number }>('/me/notifications', {
        page: 1,
        pageSize: 1,
        unread: 1,
      });
      const list = toList<Notification>(res);
      const extra = res as { unread?: number } | undefined;
      return typeof extra?.unread === 'number' ? extra.unread : list.total;
    },
    enabled: isLoggedIn,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [drawerOpen]);

  return (
    <div className="app-shell">
      <SiteHeader onToggleDrawer={() => setDrawerOpen(true)} unread={unread} />
      <main className="page">
        <Outlet />
      </main>
      <SiteFooter />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} unread={unread} />
    </div>
  );
}
