import type { NextFunction, Request, Response } from 'express';
import type { DB } from '../db/index.js';
import { errors } from '../lib/errors.js';
import { findSession, readSessionId } from '../lib/session.js';

/** 解析 Cookie 中的会话并挂到 req.auth（不强制登录） */
export function authenticate(db: DB) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const sessionId = readSessionId(req.cookies);
    if (sessionId) {
      const found = findSession(db, sessionId);
      if (found && found.user.status === 'active') {
        req.auth = {
          sessionId,
          level: found.session.level_snapshot,
          user: found.user,
        };
      }
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(errors.unauthorized());
    return;
  }
  next();
}

/** level>=1 管理员 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(errors.unauthorized());
    return;
  }
  if (req.auth.level < 1) {
    next(errors.forbidden('需要管理员权限'));
    return;
  }
  next();
}

/** level>=2 超级管理员（API.md 中标 ★ 的接口） */
export function requireSuper(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(errors.unauthorized());
    return;
  }
  if (req.auth.level < 2) {
    next(errors.forbidden('需要超级管理员权限'));
    return;
  }
  next();
}

export function isAdmin(req: Request): boolean {
  return (req.auth?.level ?? 0) >= 1;
}

export function isSuper(req: Request): boolean {
  return (req.auth?.level ?? 0) >= 2;
}

/** 权限描述（/auth/me 返回给前端，仅用于隐藏入口，后端仍强制校验） */
export function permissionSummary(req: Request) {
  const level = req.auth?.level ?? 0;
  return {
    canAdmin: level >= 1,
    canSuper: level >= 2,
  };
}

export type { AuthContext } from '../types.js';
