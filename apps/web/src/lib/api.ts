import { bus } from './bus';
import type { Paginated } from '../types';

export const API_BASE = '/api';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** 后端错误码 → 中文提示（后端 message 优先） */
const CODE_TEXT: Record<string, string> = {
  unauthorized: '登录状态已失效，请重新登录',
  forbidden: '没有权限执行该操作',
  not_found: '请求的数据不存在',
  invalid_request: '请求参数有误',
  email_unverified: '请先完成邮箱验证',
  registration_closed: '当前赛季报名未开放或已结束',
  deadline_passed: '已超过提交截止时间',
  conflict: '数据冲突，请刷新后重试',
  rate_limited: '操作过于频繁，请稍后再试',
  bad_signature: '服务器签名校验失败',
  stale_timestamp: '请求时间戳已过期',
  nonce_reused: '请求重复提交',
  internal_error: '服务器内部错误',
};

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    if (err.code && CODE_TEXT[err.code]) return err.message || CODE_TEXT[err.code];
    return err.message || CODE_TEXT.internal_error;
  }
  if (err instanceof Error) return err.message;
  return '请求失败，请稍后重试';
}

const SNAKE = /^[a-z0-9]+(_[a-z0-9]+)+$/;

function toCamelKey(key: string): string {
  if (!SNAKE.test(key)) return key;
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** 深度把 snake_case key 转 camelCase，兼容两种后端风格 */
export function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src)) {
      out[toCamelKey(key)] = normalizeKeys(src[key]);
    }
    return out;
  }
  return value;
}

export function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** 静默：不自动弹 toast（页面自己处理错误展示） */
  silent?: boolean;
  /** 401 时不触发全局跳转（如 /auth/me 探测） */
  skipAuthRedirect?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, signal, silent, skipAuthRedirect } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;

  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    const offline = new ApiError('network_error', '无法连接服务器，请检查网络或稍后重试', 0);
    if (!silent) bus.emit('toast', { kind: 'err', message: offline.message });
    throw offline;
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  let data: unknown = null;
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    const text = await res.text();
    data = text || null;
  }

  const normalized = normalizeKeys(data);

  if (!res.ok) {
    const errObj = (normalized as { error?: { code?: string; message?: string } } | null)?.error;
    const code = errObj?.code || `http_${res.status}`;
    const message = errObj?.message || CODE_TEXT[code] || `请求失败（HTTP ${res.status}）`;
    const apiErr = new ApiError(code, message, res.status);

    if (res.status === 401) {
      if (!skipAuthRedirect) bus.emit('unauthorized', apiErr);
      else bus.emit('unauthorized:silent');
    } else if (!silent) {
      bus.emit('toast', { kind: 'err', message });
    }
    throw apiErr;
  }

  return normalized as T;
}

/** GET 请求 */
export function get<T>(path: string, params?: Record<string, unknown>, opts?: RequestOptions): Promise<T> {
  return request<T>(`${path}${buildQuery(params)}`, { ...opts, method: 'GET' });
}

export function post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>(path, { ...opts, method: 'POST', body });
}

export function patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>(path, { ...opts, method: 'PATCH', body });
}

export function put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>(path, { ...opts, method: 'PUT', body });
}

export function del<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>(path, { ...opts, method: 'DELETE', body });
}

/** 上传（multipart），可拿到上传进度 */
export function upload<T>(
  path: string,
  file: File,
  fieldName = 'file',
  onProgress?: (percent: number) => void,
  extra?: Record<string, string>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const form = new FormData();
    form.append(fieldName, file);
    if (extra) Object.entries(extra).forEach(([k, v]) => form.append(k, v));

    // 需要进度时用 XHR，否则走统一封装
    if (!onProgress) {
      request<T>(path, { method: 'POST', form })
        .then(resolve)
        .catch(reject);
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      const normalized = normalizeKeys(data);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(normalized as T);
      } else {
        const errObj = (normalized as { error?: { code?: string; message?: string } } | null)?.error;
        const code = errObj?.code || `http_${xhr.status}`;
        const message = errObj?.message || CODE_TEXT[code] || `上传失败（HTTP ${xhr.status}）`;
        if (xhr.status === 401) bus.emit('unauthorized');
        reject(new ApiError(code, message, xhr.status));
      }
    };
    xhr.onerror = () => {
      const err = new ApiError('network_error', '上传失败：网络异常', 0);
      bus.emit('toast', { kind: 'err', message: err.message });
      reject(err);
    };
    xhr.send(form);
  });
}

/** 列表信封归一化：兼容数组 / {items} / {data:{items}} */
export function toList<T>(data: unknown): Paginated<T> {
  const fallback: Paginated<T> = { items: [], total: 0, page: 1, pageSize: 20 };
  if (!data) return fallback;
  if (Array.isArray(data)) {
    return { items: data as T[], total: (data as T[]).length, page: 1, pageSize: (data as T[]).length };
  }
  const obj = data as Record<string, unknown>;
  const nested = obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : obj;
  const rawItems = nested.items ?? nested.list ?? nested.rows ?? nested.data;
  const items = Array.isArray(rawItems) ? (rawItems as T[]) : [];
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    items,
    total: num(nested.total, num(nested.count, items.length)),
    page: num(nested.page, 1),
    pageSize: num(nested.pageSize, items.length || 20),
  };
}

/** 下载鉴权文件（浏览器无法直接带 cookie 走 <a download>） */
export async function downloadFile(path: string, fallbackName = 'download'): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin' });
  if (!res.ok) {
    let message = `下载失败（HTTP ${res.status}）`;
    try {
      const data = normalizeKeys(await res.json()) as { error?: { message?: string } };
      if (data?.error?.message) message = data.error.message;
    } catch {
      /* ignore */
    }
    if (res.status === 401) bus.emit('unauthorized');
    const err = new ApiError('download_failed', message, res.status);
    bus.emit('toast', { kind: 'err', message });
    throw err;
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 上传后计算本地文件大小展示 */
export function humanFileSize(file: File): string {
  const mb = file.size / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
}
