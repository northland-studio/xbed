import type { AppConfig } from '../config.js';
import type { DB } from '../db/index.js';
import type { OAuthAccountRow } from '../db/models.js';
import { decryptString, encryptString } from './crypto.js';
import { addMs, nowIso } from './time.js';

/** 玄剑 OAuth 返回的用户资料（字段以 OAUTH.md v2 为准，解析时做兼容） */
export interface XuanjianUser {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  level: number;
  title: string | null;
  contribution: number;
  is_member: boolean;
  game_id: string | null;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export interface VerifyResult {
  valid: boolean;
  user?: Partial<XuanjianUser>;
}

export interface MemberResult {
  is_member?: boolean;
  game_id?: string | null;
  level?: number | null;
  reason?: string;
}

/**
 * OAuth 客户端抽象：生产使用 createXuanjianOAuthClient()，
 * 测试可注入 MockOAuthClient，避免依赖真实 client_secret / 网络。
 */
export interface OAuthClient {
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  verify(accessToken: string): Promise<VerifyResult>;
  fetchUserInfo(accessToken: string): Promise<Partial<XuanjianUser>>;
  fetchMember(accessToken: string): Promise<MemberResult>;
  refresh(refreshToken: string): Promise<TokenSet>;
  revoke(refreshToken: string): Promise<void>;
}

const USER_FIELD_ALIASES = {
  id: ['id', 'user_id', 'userId', 'uid', 'xuanjian_user_id', 'xuanjianUserId'],
  username: ['username', 'user_name', 'userName'],
  nickname: ['nickname', 'nick_name', 'nickName', 'display_name', 'displayName'],
  avatar: ['avatar', 'avatar_url', 'avatarUrl'],
  level: ['level'],
  title: ['title', 'rank_title', 'rankTitle'],
  contribution: ['contribution', 'contribution_points', 'contributionPoints', 'points'],
  is_member: ['is_member', 'isMember', 'member'],
  game_id: ['game_id', 'gameId', 'mc_game_id', 'mcGameId', 'minecraft_id', 'minecraftId'],
} as const;

type UserField = keyof XuanjianUser;

function readField(source: Record<string, unknown>, field: UserField): unknown {
  for (const alias of USER_FIELD_ALIASES[field]) {
    if (source[alias] !== undefined && source[alias] !== null) return source[alias];
  }
  return undefined;
}

/** 从多层响应对象中尽力抽取用户字段（兼容 {user}, {data:{user}}, {data}, 顶层） */
export function extractUser(payloads: unknown[]): Partial<XuanjianUser> {
  const result: Partial<XuanjianUser> = {};
  for (const payload of payloads) {
    if (!payload || typeof payload !== 'object') continue;
    const root = payload as Record<string, unknown>;
    const candidates: Array<Record<string, unknown>> = [];
    for (const key of ['user', 'data', 'member', 'profile']) {
      const value = root[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = value as Record<string, unknown>;
        candidates.push(nested);
        if (nested.user && typeof nested.user === 'object') {
          candidates.push(nested.user as Record<string, unknown>);
        }
      }
    }
    candidates.push(root);

    for (const candidate of candidates) {
      for (const field of Object.keys(USER_FIELD_ALIASES) as UserField[]) {
        if (result[field] !== undefined) continue;
        const raw = readField(candidate, field);
        if (raw === undefined) continue;
        switch (field) {
          case 'level': {
            const num = Number(raw);
            if (Number.isFinite(num)) result.level = num;
            break;
          }
          case 'contribution': {
            const num = Number(raw);
            if (Number.isFinite(num)) result.contribution = num;
            break;
          }
          case 'is_member': {
            result.is_member = raw === true || raw === 1 || raw === '1' || raw === 'true';
            break;
          }
          case 'avatar':
          case 'game_id':
          case 'title':
            result[field] = raw === null ? null : String(raw);
            break;
          default:
            result[field] = String(raw);
        }
      }
    }
  }
  return result;
}

function mergeUser(...parts: Array<Partial<XuanjianUser> | undefined>): Partial<XuanjianUser> {
  const merged: Partial<XuanjianUser> = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [key, value] of Object.entries(part)) {
      if (value !== undefined && value !== null) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
  return merged;
}

async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; body: any }> {
  const { timeoutMs = 10_000, ...rest } = init;
  const response = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body };
}

/** 生产用玄剑 OAuth 机密客户端 */
export function createXuanjianOAuthClient(config: AppConfig): OAuthClient {
  const base = config.oauth.providerUrl.replace(/\/+$/, '');

  const tokenRequest = async (payload: Record<string, unknown>): Promise<TokenSet> => {
    const { status, body } = await fetchJson(`${base}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        client_id: config.oauth.clientId,
        client_secret: config.oauth.clientSecret,
      }),
    });
    const data = body?.data ?? body;
    if (status >= 400 || !data?.access_token) {
      const detail = data?.error || data?.message || `HTTP ${status}`;
      throw new Error(`玄剑 OAuth token 交换失败: ${String(detail)}`);
    }
    return data as TokenSet;
  };

  return {
    authorizeUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: config.oauth.clientId,
        redirect_uri: config.oauth.redirectUri,
        response_type: 'code',
        scope: config.oauth.scope,
        state,
      });
      return `${base}/api/oauth/authorize?${params.toString()}`;
    },
    exchangeCode(code: string): Promise<TokenSet> {
      return tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.oauth.redirectUri,
      });
    },
    async verify(accessToken: string): Promise<VerifyResult> {
      const { status, body } = await fetchJson(`${base}/api/oauth/verify`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (status >= 400) return { valid: false };
      const data = body?.data ?? body;
      const valid = data?.valid === undefined ? Boolean(data?.user ?? data?.ok) : Boolean(data.valid);
      return { valid, user: extractUser([body]) };
    },
    async fetchUserInfo(accessToken: string): Promise<Partial<XuanjianUser>> {
      const { status, body } = await fetchJson(`${base}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (status >= 400) return {};
      return extractUser([body]);
    },
    async fetchMember(accessToken: string): Promise<MemberResult> {
      const { status, body } = await fetchJson(`${base}/api/oauth/member`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (status >= 400) {
        return { is_member: false, reason: body?.error ?? `HTTP ${status}` };
      }
      const data = body?.data ?? body;
      return {
        is_member: data?.is_member ?? data?.isMember ?? data?.member,
        game_id: data?.game_id ?? data?.gameId ?? null,
        level: data?.level ?? null,
        reason: data?.reason,
      };
    },
    refresh(refreshToken: string): Promise<TokenSet> {
      return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    },
    async revoke(refreshToken: string): Promise<void> {
      await fetchJson(`${base}/api/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: refreshToken,
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
        }),
      });
    },
  };
}

/** 测试/本地联调用的 mock OAuth 客户端（不发起网络请求） */
export class MockOAuthClient implements OAuthClient {
  constructor(private user: Partial<XuanjianUser> = {}) {}

  setUser(user: Partial<XuanjianUser>): void {
    this.user = user;
  }

  authorizeUrl(state: string): string {
    return `https://mock-oauth.local/api/oauth/authorize?state=${encodeURIComponent(state)}&client_id=mock`;
  }

  async exchangeCode(code: string): Promise<TokenSet> {
    if (code !== 'mock-code' && !code.startsWith('mock-code')) {
      throw new Error('mock 授权码无效');
    }
    return {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 7200,
      scope: 'read:user read:member',
      token_type: 'Bearer',
    };
  }

  async verify(accessToken: string): Promise<VerifyResult> {
    if (accessToken !== 'mock-access-token') return { valid: false };
    return { valid: true, user: this.user };
  }

  async fetchUserInfo(): Promise<Partial<XuanjianUser>> {
    return this.user;
  }

  async fetchMember(): Promise<MemberResult> {
    return {
      is_member: this.user.is_member ?? false,
      game_id: this.user.game_id ?? null,
      level: this.user.level ?? 0,
    };
  }

  async refresh(): Promise<TokenSet> {
    return {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token-rotated',
      expires_in: 7200,
    };
  }

  async revoke(): Promise<void> {
    return undefined;
  }
}

/** 合并 OAuth 各接口资料为完整用户（verify + userinfo + member） */
export async function resolveOAuthUser(
  client: OAuthClient,
  tokens: TokenSet,
): Promise<{ valid: boolean; user: Partial<XuanjianUser> }> {
  const verified = await client.verify(tokens.access_token);
  if (!verified.valid) return { valid: false, user: {} };
  const [userinfo, member] = await Promise.all([
    client.fetchUserInfo(tokens.access_token).catch((): Partial<XuanjianUser> => ({})),
    client.fetchMember(tokens.access_token).catch((): MemberResult => ({})),
  ]);
  const merged = mergeUser(verified.user, userinfo, {
    is_member: member.is_member ?? undefined,
    game_id: member.game_id ?? undefined,
    level: member.level ?? undefined,
  });
  return { valid: true, user: merged };
}

export interface SaveTokenOptions {
  scope?: string;
  lastLoginAt?: string;
}

/** 加密保存 OAuth token（access/refresh 均 AES-256-GCM） */
export function saveOAuthAccount(
  db: DB,
  userId: number,
  tokens: TokenSet,
  config: AppConfig,
  options: SaveTokenOptions = {},
): void {
  const now = nowIso();
  const expiresAt = tokens.expires_in ? addMs(now, tokens.expires_in * 1000) : null;
  const existing = db
    .prepare('SELECT * FROM oauth_accounts WHERE user_id = ? AND provider = ?')
    .get(userId, 'xuanjian') as OAuthAccountRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE oauth_accounts SET
         access_token_enc = ?,
         refresh_token_enc = COALESCE(?, refresh_token_enc),
         access_expires_at = ?,
         scope = COALESCE(?, scope),
         last_login_at = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      encryptString(tokens.access_token, config.encryptionKey),
      tokens.refresh_token ? encryptString(tokens.refresh_token, config.encryptionKey) : null,
      expiresAt,
      options.scope ?? tokens.scope ?? null,
      options.lastLoginAt ?? now,
      now,
      existing.id,
    );
    return;
  }

  db.prepare(
    `INSERT INTO oauth_accounts
       (user_id, provider, access_token_enc, refresh_token_enc, access_expires_at, scope, last_login_at)
     VALUES (?, 'xuanjian', ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    encryptString(tokens.access_token, config.encryptionKey),
    tokens.refresh_token ? encryptString(tokens.refresh_token, config.encryptionKey) : null,
    expiresAt,
    options.scope ?? tokens.scope ?? null,
    options.lastLoginAt ?? now,
  );
}

export function getOAuthAccount(db: DB, userId: number): OAuthAccountRow | null {
  const row = db
    .prepare('SELECT * FROM oauth_accounts WHERE user_id = ? AND provider = ?')
    .get(userId, 'xuanjian') as OAuthAccountRow | undefined;
  return row ?? null;
}

/** 按需刷新 access_token（refresh_token 一次性轮换，成功后立即覆盖存储） */
export async function refreshStoredToken(
  db: DB,
  userId: number,
  client: OAuthClient,
  config: AppConfig,
): Promise<TokenSet | null> {
  const account = getOAuthAccount(db, userId);
  if (!account?.refresh_token_enc) return null;
  const refreshToken = decryptString(account.refresh_token_enc, config.encryptionKey);
  const tokens = await client.refresh(refreshToken);
  saveOAuthAccount(db, userId, tokens, config);
  return tokens;
}
