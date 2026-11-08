import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** apps/api 根目录（src/ 与 dist/ 下均成立） */
export const API_ROOT = path.resolve(moduleDir, '..');
export const DEFAULT_ENV_FILE = path.join(API_ROOT, '.env');

function loadDotEnv(file = DEFAULT_ENV_FILE): void {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromName: string;
  fromEmail: string;
}

export interface OAuthConfig {
  providerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  /** clientId 与 clientSecret 均已配置 */
  configured: boolean;
}

/** 玄剑官网（同源站点）地址，用于查询成员皮肤等站内数据 */
export interface SiteConfig {
  baseUrl: string;
}

export interface LimitsConfig {
  uploadMaxLogBytes: number;
  uploadMaxReplayBytes: number;
  evidenceDeadlineMinutes: number;
  appealDeadlineHours: number;
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  publicOrigin: string;
  allowedOrigins: string[];
  dbFile: string;
  filesDir: string;
  sessionSecret: string;
  encryptionKey: string;
  sessionTtlDays: number;
  cookieSecure: boolean;
  trustProxy: boolean;
  oauth: OAuthConfig;
  site: SiteConfig;
  smtp: SmtpConfig | null;
  limits: LimitsConfig;
  /** 仅开发环境：允许 /api/auth/mock-login 建会话 */
  oauthMock: boolean;
  /** 测试环境可关闭限流 */
  rateLimitDisabled: boolean;
}

const DEV_SECRET_FALLBACK = 'xbed-dev-only-insecure-fallback-secret-change-me';
const MB = 1024 * 1024;

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 从环境变量构造配置。tests 直接传自定义值，生产由 loadConfig() 读取 .env + process.env。
 */
export function createConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV || 'development').trim();
  const isProduction = nodeEnv === 'production';

  const publicOrigin = (env.PUBLIC_ORIGIN || 'http://127.0.0.1:3939').replace(/\/+$/, '');
  const extraOrigins = (env.EXTRA_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const devOrigins = isProduction ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const allowedOrigins = Array.from(new Set([publicOrigin, ...extraOrigins, ...devOrigins]));

  const resolvePath = (value: string | undefined, fallback: string): string => {
    const raw = (value || fallback).trim();
    return path.isAbsolute(raw) ? raw : path.resolve(API_ROOT, raw);
  };

  const configuredSessionSecret = (env.SESSION_SECRET || '').trim();
  const configuredEncryptionKey = (env.ENCRYPTION_KEY || '').trim();

  if (isProduction) {
    if (!configuredSessionSecret || configuredSessionSecret.length < 32) {
      throw new Error('配置错误：生产环境必须设置 SESSION_SECRET（至少 32 字符）');
    }
    if (!configuredEncryptionKey || configuredEncryptionKey.length < 32) {
      throw new Error('配置错误：生产环境必须设置 ENCRYPTION_KEY（至少 32 字符，建议 64 位 hex）');
    }
  }

  const sessionSecret = configuredSessionSecret || DEV_SECRET_FALLBACK;
  const encryptionKey = configuredEncryptionKey || DEV_SECRET_FALLBACK;

  const clientId = (env.XUANJIAN_CLIENT_ID || '').trim();
  const clientSecret = (env.XUANJIAN_CLIENT_SECRET || '').trim();
  const providerUrl = (env.XUANJIAN_PROVIDER_URL || 'https://www.xuanjian.top').replace(/\/+$/, '');
  // 站内数据（皮肤等）查询地址：生产建议写内网 http://127.0.0.1:3000，避免走公网
  const siteBaseUrl = (env.XUANJIAN_SITE_URL || providerUrl).replace(/\/+$/, '');

  const smtpHost = (env.SMTP_HOST || '').trim();
  const smtp: SmtpConfig | null = smtpHost
    ? {
        host: smtpHost,
        port: int(env.SMTP_PORT, 465),
        secure: bool(env.SMTP_SECURE, int(env.SMTP_PORT, 465) === 465),
        user: (env.SMTP_USER || '').trim() || undefined,
        pass: env.SMTP_PASS || undefined,
        fromName: (env.SMTP_FROM_NAME || 'XBed 赛事平台').trim(),
        fromEmail: (env.SMTP_FROM_EMAIL || env.SMTP_USER || 'noreply@xuanjian.top').trim(),
      }
    : null;

  return {
    nodeEnv,
    isProduction,
    port: int(env.PORT, 3939),
    publicOrigin,
    allowedOrigins,
    dbFile: resolvePath(env.DB_FILE, './data/xbed.db'),
    filesDir: resolvePath(env.FILES_DIR, './data/files'),
    sessionSecret,
    encryptionKey,
    sessionTtlDays: Math.max(1, int(env.SESSION_TTL_DAYS, 7)),
    cookieSecure: bool(env.COOKIE_SECURE, isProduction),
    trustProxy: bool(env.TRUST_PROXY, false),
    oauth: {
      providerUrl,
      clientId,
      clientSecret,
      redirectUri: (env.XUANJIAN_REDIRECT_URI || `${publicOrigin}/api/auth/callback`).trim(),
      scope: (env.XUANJIAN_SCOPE || 'read:user read:member').trim(),
      configured: Boolean(clientId && clientSecret),
    },
    smtp,
    site: {
      baseUrl: siteBaseUrl,
    },
    limits: {
      uploadMaxLogBytes: Math.round(num(env.UPLOAD_MAX_LOG_MB, 20) * MB),
      uploadMaxReplayBytes: Math.round(num(env.UPLOAD_MAX_MCPR_MB, 300) * MB),
      evidenceDeadlineMinutes: Math.max(1, int(env.EVIDENCE_DEADLINE_MINUTES, 60)),
      appealDeadlineHours: Math.max(1, int(env.APPEAL_DEADLINE_HOURS, 48)),
    },
    oauthMock: !isProduction && bool(env.OAUTH_MOCK, nodeEnv !== 'production'),
    rateLimitDisabled: nodeEnv === 'test' || bool(env.DISABLE_RATE_LIMIT, false),
  };
}

let cached: AppConfig | null = null;

/** 生产入口：加载 apps/api/.env 后构造配置（结果缓存） */
export function getConfig(): AppConfig {
  if (!cached) {
    loadDotEnv();
    cached = createConfig(process.env);
  }
  return cached;
}
