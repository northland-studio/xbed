import type { AppConfig, SmtpConfig } from '../config.js';
import type { DB } from '../db/index.js';
import { decryptString, encryptString } from './crypto.js';

export function getSetting(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function getSettingNumber(db: DB, key: string, fallback: number): number {
  const raw = getSetting(db, key);
  if (raw === null) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSettingBool(db: DB, key: string, fallback: boolean): boolean {
  const raw = getSetting(db, key);
  if (raw === null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function setSetting(
  db: DB,
  key: string,
  value: string,
  options: { isSecret?: boolean; updatedBy?: number | null } = {},
): void {
  db.prepare(
    `INSERT INTO system_settings (key, value, is_secret, updated_by, updated_at)
     VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       is_secret = excluded.is_secret,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  ).run(key, value, options.isSecret ? 1 : 0, options.updatedBy ?? null);
}

const SMTP_KEYS = {
  host: 'smtp_host',
  port: 'smtp_port',
  secure: 'smtp_secure',
  user: 'smtp_user',
  pass: 'smtp_pass',
  fromName: 'smtp_from_name',
  fromEmail: 'smtp_from_email',
} as const;

/**
 * SMTP 配置优先级：system_settings（后台配置，密码加密）> 环境变量。
 * 返回 null 表示未配置（验证码会打印到服务端日志）。
 */
export function getSmtpSettings(db: DB, config: AppConfig): SmtpConfig | null {
  const host = getSetting(db, SMTP_KEYS.host)?.trim();
  if (host) {
    const rawPort = getSetting(db, SMTP_KEYS.port);
    const port = rawPort ? Number.parseInt(rawPort, 10) : 465;
    const secureRaw = getSetting(db, SMTP_KEYS.secure);
    const secure = secureRaw === null ? port === 465 : ['1', 'true', 'yes'].includes(secureRaw);
    const passEnc = getSetting(db, SMTP_KEYS.pass);
    let pass: string | undefined;
    if (passEnc) {
      try {
        pass = decryptString(passEnc, config.encryptionKey);
      } catch {
        pass = undefined;
      }
    }
    const user = getSetting(db, SMTP_KEYS.user) || undefined;
    return {
      host,
      port: Number.isFinite(port) ? port : 465,
      secure,
      user,
      pass,
      fromName: getSetting(db, SMTP_KEYS.fromName) || 'XBed 赛事平台',
      fromEmail: getSetting(db, SMTP_KEYS.fromEmail) || user || 'noreply@xuanjian.top',
    };
  }
  return config.smtp;
}

export interface SmtpSettingsInput {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromName?: string;
  fromEmail?: string;
}

export function saveSmtpSettings(
  db: DB,
  config: AppConfig,
  input: SmtpSettingsInput,
  updatedBy: number | null,
): void {
  setSetting(db, SMTP_KEYS.host, input.host, { updatedBy });
  setSetting(db, SMTP_KEYS.port, String(input.port), { updatedBy });
  setSetting(db, SMTP_KEYS.secure, input.secure ? '1' : '0', { updatedBy });
  setSetting(db, SMTP_KEYS.user, input.user ?? '', { updatedBy });
  if (input.pass) {
    setSetting(db, SMTP_KEYS.pass, encryptString(input.pass, config.encryptionKey), {
      isSecret: true,
      updatedBy,
    });
  }
  setSetting(db, SMTP_KEYS.fromName, input.fromName ?? 'XBed 赛事平台', { updatedBy });
  setSetting(db, SMTP_KEYS.fromEmail, input.fromEmail ?? '', { updatedBy });
}

/** 后台返回的脱敏 SMTP 配置 */
export function describeSmtpSettings(db: DB, config: AppConfig) {
  const settings = getSmtpSettings(db, config);
  const configured = Boolean(getSetting(db, SMTP_KEYS.host));
  if (!settings) {
    return {
      host: '',
      port: 465,
      secure: true,
      user: '',
      passMasked: '',
      fromName: 'XBed 赛事平台',
      fromEmail: '',
      configured: false,
      source: 'none' as const,
    };
  }
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    user: settings.user ?? '',
    passMasked: settings.pass ? '******' : '',
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
    configured: true,
    source: configured ? ('database' as const) : ('env' as const),
  };
}
