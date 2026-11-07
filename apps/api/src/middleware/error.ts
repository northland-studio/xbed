import type { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError, errors, isApiError } from '../lib/errors.js';

/** 404 兜底 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(errors.notFound(`接口不存在: ${req.method} ${req.path}`));
}

function mapMulterError(error: multer.MulterError): ApiError {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return errors.fileTooLarge();
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return errors.invalidRequest('文件字段不正确或文件数量超出限制');
    default:
      return errors.invalidRequest(`文件上传失败: ${error.message}`);
  }
}

/** 统一错误响应：{ error: { code, message } } */
export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    res.status(400).json({ error: { code: 'invalid_request', message: '参数校验失败', details } });
    return;
  }

  if (error instanceof multer.MulterError) {
    const apiError = mapMulterError(error);
    res.status(apiError.status).json({ error: { code: apiError.code, message: apiError.message } });
    return;
  }

  if (isApiError(error)) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  // better-sqlite3 唯一约束等
  const maybeSqlite = error as { code?: string; message?: string };
  if (typeof maybeSqlite?.code === 'string' && maybeSqlite.code.startsWith('SQLITE_CONSTRAINT')) {
    res.status(409).json({ error: { code: 'conflict', message: '数据冲突（唯一约束）' } });
    return;
  }

  console.error('[api] 未处理错误:', error);
  res.status(500).json({ error: { code: 'internal_error', message: '服务器内部错误' } });
}

/** 包装 async 路由，使异常进入 errorHandler */
export function asyncRoute<T extends (req: Request, res: Response, next: NextFunction) => unknown>(
  handler: T,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function jsonOk(res: Response, body: unknown = { ok: true }): void {
  res.status(200).json(body);
}

/** 让 Express app 接受 async 错误（供测试断言 404 等） */
export function registerErrorHandlers(app: Express): void {
  app.use(notFoundHandler);
  app.use(errorHandler);
}
