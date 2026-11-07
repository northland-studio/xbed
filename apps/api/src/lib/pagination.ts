import { errors } from './errors.js';

export interface Pagination {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginationOptions {
  defaultPageSize?: number;
  maxPageSize?: number;
}

/** 解析 ?page&pageSize（越界自动纠正） */
export function parsePagination(
  query: Record<string, unknown>,
  options: PaginationOptions = {},
): Pagination {
  const defaultPageSize = options.defaultPageSize ?? 20;
  const maxPageSize = options.maxPageSize ?? 100;
  const rawPage = Number.parseInt(String(query.page ?? '1'), 10);
  const rawPageSize = Number.parseInt(String(query.pageSize ?? String(defaultPageSize)), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
    ? Math.min(Math.max(rawPageSize, 1), maxPageSize)
    : defaultPageSize;
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export function listResponse<T>(items: T[], total: number, pagination: Pagination): ListResponse<T> {
  return { items, total, page: pagination.page, pageSize: pagination.pageSize };
}

export function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseId(value: unknown, label = 'id'): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw errors.invalidRequest(`${label} 非法`);
  }
  return parsed;
}
