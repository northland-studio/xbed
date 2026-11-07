import type { NextFunction, Request, Response } from 'express';
import { errors } from '../lib/errors.js';

/**
 * CSRF：写操作校验 Origin 与 Cookie 同源。
 * - 无 Origin 头（curl / 插件 / 服务端调用）放行（不携带浏览器 Cookie 的跨站表单不会静默成功，因为 SameSite=Lax 已限制）
 * - 有 Origin 头则必须在允许列表内
 */
export function originCheck(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, _res: Response, next: NextFunction): void => {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }
    if (!allowed.has(origin)) {
      next(errors.forbidden('请求来源（Origin）不被信任'));
      return;
    }
    next();
  };
}
