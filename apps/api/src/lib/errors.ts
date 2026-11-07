/** 统一业务错误：{ error: { code, message } } + HTTP 状态 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export const errors = {
  unauthorized: (message = '未登录或会话已过期') => new ApiError(401, 'unauthorized', message),
  forbidden: (message = '权限不足', details?: unknown) => new ApiError(403, 'forbidden', message, details),
  notFound: (message = '资源不存在') => new ApiError(404, 'not_found', message),
  invalidRequest: (message = '参数校验失败', details?: unknown) =>
    new ApiError(400, 'invalid_request', message, details),
  invalidPayload: (message = '数据格式非法', details?: unknown) =>
    new ApiError(400, 'invalid_payload', message, details),
  conflict: (message = '操作冲突', details?: unknown) => new ApiError(409, 'conflict', message, details),
  rateLimited: (message = '请求过于频繁，请稍后再试') => new ApiError(429, 'rate_limited', message),
  deadlinePassed: (message = '已超过截止时间') => new ApiError(403, 'deadline_passed', message),
  registrationClosed: (message = '报名未开放或已结束') =>
    new ApiError(403, 'registration_closed', message),
  emailUnverified: (message = '邮箱未验证，禁止报名') =>
    new ApiError(403, 'email_unverified', message),
  badSignature: (message = '签名校验失败') => new ApiError(401, 'bad_signature', message),
  staleTimestamp: (message = '请求时间戳超出允许范围') =>
    new ApiError(401, 'stale_timestamp', message),
  nonceReused: (message = 'Nonce 已被使用') => new ApiError(401, 'nonce_reused', message),
  fileTooLarge: (message = '文件超过大小限制') => new ApiError(413, 'file_too_large', message),
  invalidFileType: (message = '文件类型不允许') =>
    new ApiError(400, 'invalid_file_type', message),
  oauthFailed: (message = '玄剑 OAuth 调用失败') => new ApiError(502, 'oauth_failed', message),
  notConfigured: (message = '服务未配置', details?: unknown) =>
    new ApiError(503, 'not_configured', message, details),
  internal: (message = '服务器内部错误') => new ApiError(500, 'internal_error', message),
};
