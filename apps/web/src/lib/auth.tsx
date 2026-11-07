import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { get, post } from './api';
import { bus } from './bus';
import type { SessionInfo, User } from '../types';

interface AuthState {
  user: User | null;
  level: number;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isSuper: boolean;
  isLoading: boolean;
  refetch: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const AUTH_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const { data, isLoading, refetch } = useQuery({
    queryKey: AUTH_KEY,
    queryFn: async () => {
      const res = await get<SessionInfo>('/auth/me', undefined, { silent: true, skipAuthRedirect: true });
      return res;
    },
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const off = bus.on('unauthorized', () => {
      qc.setQueryData(AUTH_KEY, { user: null, level: 0 });
      const { pathname, search } = window.location;
      // 仅在需要登录的页面跳转登录，避免公开页误跳
      if (pathname.startsWith('/me') || pathname.startsWith('/admin')) {
        const redirect = encodeURIComponent(pathname + search);
        navigate(`/login?redirect=${redirect}`, { replace: true });
      }
    });
    const offSilent = bus.on('unauthorized:silent', () => {
      qc.setQueryData(AUTH_KEY, { user: null, level: 0 });
    });
    return () => {
      off();
      offSilent();
    };
  }, [qc, navigate]);

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout', undefined, { silent: true });
    } catch {
      /* 即使失败也清理本地态 */
    }
    qc.setQueryData(AUTH_KEY, { user: null, level: 0 });
    qc.clear();
    navigate('/', { replace: true });
  }, [qc, navigate]);

  const user = data?.user ?? null;
  const level = typeof data?.level === 'number' ? data.level : (user?.level ?? 0);
  const permissions = (data as SessionInfo | undefined)?.permissions as
    | { canAdmin?: boolean; canSuper?: boolean }
    | string[]
    | undefined;

  const canAdmin =
    (Array.isArray(permissions) ? false : permissions?.canAdmin) || level >= 1;
  const canSuper =
    (Array.isArray(permissions) ? false : permissions?.canSuper) || level >= 2;

  const value = useMemo<AuthState>(
    () => ({
      user,
      level,
      isLoggedIn: !!user,
      isAdmin: !!user && !!canAdmin,
      isSuper: !!user && !!canSuper,
      isLoading,
      refetch,
      logout,
    }),
    [user, level, canAdmin, canSuper, isLoading, refetch, logout],
  );

  // 位置变化时静默刷新会话，保证登录态与页面同步（不阻塞渲染）
  useEffect(() => {
    if (!location.pathname.startsWith('/auth')) {
      void refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}

/** 需要登录的页面的守卫组件 */
export function RequireLogin({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    }
  }, [isLoggedIn, isLoading, location, navigate]);

  if (isLoading) {
    return (
      <div className="state-box">
        <div className="spinner" />
        <div className="state-desc">正在校验登录状态…</div>
      </div>
    );
  }
  if (!isLoggedIn) {
    return (
      <div className="state-box">
        <div className="state-icon">🔒</div>
        <div className="state-title">需要登录</div>
        <div className="state-desc">此页面需要登录后才能访问，正在跳转到登录页…</div>
      </div>
    );
  }
  return <>{children}</>;
}
