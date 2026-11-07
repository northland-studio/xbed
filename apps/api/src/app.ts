import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import type { AppConfig } from './config.js';
import type { DB } from './db/index.js';
import { createXuanjianOAuthClient, MockOAuthClient, type OAuthClient } from './lib/oauth.js';
import { authenticate } from './middleware/auth.js';
import { originCheck } from './middleware/origin.js';
import { registerErrorHandlers } from './middleware/error.js';
import { pingDatabase } from './db/index.js';
import { createAuthRouter } from './routes/auth.js';
import { createPublicRouter } from './routes/public.js';
import { createMeRouter } from './routes/me.js';
import { createRegistrationsRouter } from './routes/registrations.js';
import { createEvidenceRouter } from './routes/evidence.js';
import { createAppealsRouter } from './routes/appeals.js';
import { createTeamsRouter, createMeTeamsRouter } from './routes/teams.js';
import { createAdminRouter } from './routes/admin/index.js';
import { createIngestRouter } from './routes/ingest.js';

export interface AppContext {
  db: DB;
  config: AppConfig;
  oauthClient: OAuthClient | null;
}

export interface CreateAppOptions {
  db: DB;
  config: AppConfig;
  /** 测试可注入 mock OAuth 客户端 */
  oauthClient?: OAuthClient | null;
}

export function getContext(req: express.Request): AppContext {
  return req.app.locals.ctx as AppContext;
}

export function createApp(options: CreateAppOptions): Express {
  const { db, config } = options;
  const oauthClient =
    options.oauthClient !== undefined
      ? options.oauthClient
      : config.oauth.configured
        ? createXuanjianOAuthClient(config)
        : config.oauthMock
          ? new MockOAuthClient()
          : null;

  const ctx: AppContext = { db, config, oauthClient };
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.locals.ctx = ctx;

  const startedAt = Date.now();

  app.use(cookieParser());

  // 服务器上报必须读取原始 body 计算 SHA-256，因此在 json 解析之前挂载
  app.use('/api/ingest', createIngestRouter(ctx));

  app.use(express.json({ limit: '1mb' }));
  app.use(originCheck(config.allowedOrigins));
  app.use(authenticate(db));

  app.get('/api/health', (_req, res) => {
    const dbOk = pingDatabase(db);
    res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      db: dbOk ? 'ok' : 'error',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      version: '1.0.0',
      time: new Date().toISOString(),
    });
  });

  app.use('/api/auth', createAuthRouter(ctx));
  app.use('/api/admin', createAdminRouter(ctx));
  app.use('/api/me/teams', createMeTeamsRouter(ctx));
  app.use('/api/teams', createTeamsRouter(ctx));
  app.use('/api/me', createMeRouter(ctx));
  app.use('/api', createRegistrationsRouter(ctx));
  app.use('/api', createEvidenceRouter(ctx));
  app.use('/api', createAppealsRouter(ctx));
  app.use('/api', createPublicRouter(ctx));

  registerErrorHandlers(app);
  return app;
}

export { express };
