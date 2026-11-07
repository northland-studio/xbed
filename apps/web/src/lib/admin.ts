import { useCallback } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { get, toList } from './api';
import { useToast } from './toast';
import type { Paginated } from '../types';

/** 后台列表查询：统一 {items,total,page,pageSize} 信封 */
export function useList<T>(
  key: QueryKey,
  path: string,
  params?: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: key,
    queryFn: async () => toList<T>(await get<Paginated<T>>(path, params)),
    enabled,
  });
}

/** 通用写操作：toast + 失效缓存 */
export function useAction() {
  const toast = useToast();
  const qc = useQueryClient();

  return useCallback(
    async (
      fn: () => Promise<unknown>,
      opts: { success?: string; invalidate?: QueryKey[]; onDone?: () => void } = {},
    ): Promise<boolean> => {
      try {
        await fn();
        if (opts.success) toast.success(opts.success);
        if (opts.invalidate) {
          await Promise.all(opts.invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
        }
        opts.onDone?.();
        return true;
      } catch {
        // 错误提示由 api 层统一 toast
        return false;
      }
    },
    [toast, qc],
  );
}
