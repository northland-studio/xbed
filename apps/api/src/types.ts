import type { UserRow } from './db/models.js';

export interface AuthContext {
  sessionId: string;
  /** 会话创建时的等级快照（本会话内不刷新） */
  level: number;
  user: UserRow;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export type AsyncHandler = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => unknown;
