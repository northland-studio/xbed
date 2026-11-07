/** 极简事件总线：让非 React 模块（api 层）也能触发 toast / 登录失效处理 */
type Handler = (payload?: unknown) => void;

const listeners = new Map<string, Set<Handler>>();

export const bus = {
  on(event: string, handler: Handler): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => {
      listeners.get(event)?.delete(handler);
    };
  },
  emit(event: string, payload?: unknown): void {
    listeners.get(event)?.forEach((h) => {
      try {
        h(payload);
      } catch {
        /* 单个订阅者异常不影响其他订阅者 */
      }
    });
  },
};
