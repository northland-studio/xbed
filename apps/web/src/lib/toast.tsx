import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { bus } from './bus';

export type ToastKind = 'ok' | 'err' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const recent = useRef<{ message: string; at: number }>({ message: '', at: 0 });

  const push = useCallback((kind: ToastKind, message: string) => {
    // 相同提示 4 秒内只弹一次，避免并发请求失败时刷屏
    const now = Date.now();
    if (recent.current.message === message && now - recent.current.at < 4000) return;
    recent.current = { message, at: now };
    const id = ++seq;
    setItems((prev) => [...prev.slice(-4), { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, kind === 'err' ? 5200 : 3200);
  }, []);

  useEffect(() => {
    const off = bus.on('toast', (payload) => {
      const p = payload as { kind?: ToastKind; message?: string } | undefined;
      if (p?.message) push(p.kind ?? 'info', p.message);
    });
    return off;
  }, [push]);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('ok', m),
      error: (m) => push('err', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="t-icon">{t.kind === 'ok' ? '✓' : t.kind === 'err' ? '!' : 'i'}</span>
            <span className="t-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}

/** 在非组件代码里发 toast */
export function toast(kind: ToastKind, message: string): void {
  bus.emit('toast', { kind, message });
}
