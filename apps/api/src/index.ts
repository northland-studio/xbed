import fs from 'node:fs';
import { createApp } from './app.js';
import { getConfig } from './config.js';
import { cleanupExpired, migrateDatabase, openDatabase } from './db/index.js';

async function main(): Promise<void> {
  const config = getConfig();
  const db = openDatabase(config.dbFile);
  migrateDatabase(db);
  fs.mkdirSync(config.filesDir, { recursive: true });

  const app = createApp({ db, config });
  const host = (process.env.HOST || '127.0.0.1').trim();
  const server = app.listen(config.port, host, () => {
    console.log(`[api] XBed S1 API 已启动: http://${host}:${config.port}`);
    console.log(`[api] 环境: ${config.nodeEnv} | 数据库: ${config.dbFile}`);
    console.log(`[api] 文件目录: ${config.filesDir}`);
    console.log(
      `[api] 玄剑 OAuth: ${config.oauth.configured ? '已配置' : config.oauthMock ? '未配置（开发 mock 登录已启用）' : '未配置'}`,
    );
  });

  const cleanupTimer = setInterval(() => {
    try {
      const result = cleanupExpired(db);
      if (result.sessions + result.oauthStates + result.nonces > 0) {
        console.log(
          `[api] 清理过期数据 sessions=${result.sessions} oauth_states=${result.oauthStates} nonces=${result.nonces}`,
        );
      }
    } catch (error) {
      console.error('[api] 清理任务失败:', error);
    }
  }, 6 * 60 * 60 * 1000);
  cleanupTimer.unref();

  const shutdown = (signal: string) => {
    console.log(`[api] 收到 ${signal}，正在关闭...`);
    clearInterval(cleanupTimer);
    server.close(() => {
      try {
        db.close();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[api] 启动失败:', error);
  process.exitCode = 1;
});
