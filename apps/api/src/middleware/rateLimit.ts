import type { NextFunction, Request, Response } from 'express';
import { errors } from '../lib/errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** 键前缀，便于测试与运维识别 */
  name: string;
  /** 自定义键（默认 ip + name） */
  keyGenerator?: (req: Request) => string;
  disabled?: boolean;
}

export function resetRateLimits(): void {
  buckets.clear();
}

/** 简单内存固定窗口限流（单机 S1 足够；多实例部署需换 Redis/DB） */
export function rateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (options.disabled) {
      next();
      return;
    }
    const key = options.keyGenerator
      ? `${options.name}:${options.keyGenerator(req)}`
      : `${options.name}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(options.max - 1));
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      next(errors.rateLimited(`请求过于频繁，请 ${retryAfter} 秒后重试`));
      return;
    }
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)));
    next();
  };
}
