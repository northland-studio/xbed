import crypto from 'node:crypto';
import fs from 'node:fs';
import request from 'supertest';
import type { Database } from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { createConfig, type AppConfig } from '../src/config.js';
import { migrateDatabase, openDatabase } from '../src/db/index.js';
import { seedDatabase, type SeedResult } from '../src/db/seed.js';
import type { UserRow } from '../src/db/models.js';
import { randomHex } from '../src/lib/crypto.js';
import { createSession } from '../src/lib/session.js';
import { addMinutes, nowIso } from '../src/lib/time.js';
import { MockOAuthClient } from '../src/lib/oauth.js';
import type { Express } from 'express';

export interface TestContext {
  db: Database;
  config: AppConfig;
  app: Express;
  seed: SeedResult;
  oauth: MockOAuthClient;
  filesDir: string;
}

let dirCounter = 0;

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  dirCounter += 1;
  const base = createConfig({
    NODE_ENV: 'test',
    PORT: '0',
    PUBLIC_ORIGIN: 'http://127.0.0.1:3939',
    DB_FILE: ':memory:',
    FILES_DIR: `./test-tmp/files-${process.pid}-${dirCounter}-${randomHex(4)}`,
    SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789abcdef',
    ENCRYPTION_KEY: 'test-encryption-key-0123456789abcdef0123456789abcdef',
  } as NodeJS.ProcessEnv);
  return { ...base, ...overrides };
}

export function createTestContext(overrides: Partial<AppConfig> = {}): TestContext {
  const config = createTestConfig(overrides);
  const db = openDatabase(':memory:');
  migrateDatabase(db);
  const seed = seedDatabase(db, config, { silent: true });
  const oauth = new MockOAuthClient({
    id: 'mock-login-user',
    username: 'mockuser',
    nickname: 'Mock 用户',
    level: 0,
    is_member: true,
    game_id: 'MockPlayer',
    avatar: null,
    title: null,
    contribution: 0,
  });
  const app = createApp({ db, config, oauthClient: oauth });
  return { db, config, app, seed, oauth, filesDir: config.filesDir };
}

export interface CreateUserOptions {
  xuanjianUserId?: string;
  username?: string;
  nickname?: string;
  level?: number;
  gameId?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  status?: 'active' | 'disabled';
}

export function createUser(db: Database, options: CreateUserOptions = {}): UserRow {
  const id = options.xuanjianUserId ?? `xj-${randomHex(6)}`;
  const nickname = options.nickname ?? `玩家${randomHex(3)}`;
  const info = db
    .prepare(
      `INSERT INTO users
         (xuanjian_user_id, username, nickname, level, is_member, game_id, email, email_verified, status)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .run(
      id,
      options.username ?? nickname,
      nickname,
      options.level ?? 0,
      options.gameId ?? null,
      options.email ?? null,
      options.emailVerified ? 1 : 0,
      options.status ?? 'active',
    );
  return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid)) as UserRow;
}

export function createSessionFor(
  db: Database,
  user: UserRow,
  level = user.level,
): { sessionId: string; cookie: string; expiresAt: string } {
  const session = createSession(db, { userId: user.id, level, ttlDays: 7 });
  return {
    sessionId: session.id,
    cookie: `xbed_sess=${session.id}`,
    expiresAt: session.expiresAt,
  };
}

/** 创建已报名玩家（含邮箱验证 + player_statistics 初始化） */
export function registerPlayer(
  db: Database,
  seasonId: number,
  options: CreateUserOptions = {},
): { user: UserRow; cookie: string; sessionId: string; registrationId: number } {
  const user = createUser(db, { email: options.email ?? `${randomHex(4)}@example.com`, emailVerified: true, ...options });
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId) as {
    initial_points: number;
  };
  const info = db
    .prepare(
      `INSERT INTO registrations (season_id, user_id, game_id, state)
       VALUES (?, ?, ?, 'active')`,
    )
    .run(seasonId, user.id, options.gameId ?? user.game_id ?? user.nickname);
  db.prepare('INSERT OR IGNORE INTO player_statistics (user_id, season_id, points) VALUES (?, ?, ?)').run(
    user.id,
    seasonId,
    season.initial_points,
  );
  const session = createSessionFor(db, user);
  return { user, cookie: session.cookie, sessionId: session.sessionId, registrationId: Number(info.lastInsertRowid) };
}

/** 把默认 S1 赛季置为 running，便于按 startedAt 匹配+结算 */
export function setSeasonRunning(db: Database, seasonId: number, startAt?: string, endAt?: string): void {
  db.prepare("UPDATE seasons SET state = 'running', start_at = COALESCE(?, start_at), end_at = ? WHERE id = ?").run(
    startAt ?? addMinutes(nowIso(), -60 * 24 * 30),
    endAt ?? addMinutes(nowIso(), 60 * 24 * 30),
    seasonId,
  );
}

export function serverSecret(ctx: TestContext): string {
  if (!ctx.seed.serverSecret) throw new Error('seed 未返回服务器密钥');
  return ctx.seed.serverSecret;
}

export function cleanupTestFiles(ctx: TestContext): void {
  try {
    fs.rmSync(ctx.filesDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

export interface SignedHeaders {
  'X-XBed-Server': string;
  'X-XBed-Timestamp': string;
  'X-XBed-Nonce': string;
  'X-XBed-Signature': string;
  [key: string]: string;
}

export function signIngest(
  secret: string,
  options: {
    method?: string;
    path?: string;
    body?: string;
    timestamp?: string;
    nonce?: string;
    serverKey?: string;
  } = {},
): SignedHeaders {
  const method = options.method ?? 'POST';
  const path = options.path ?? '/api/ingest/match';
  const body = options.body ?? '';
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = options.nonce ?? randomHex(16);
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return {
    'X-XBed-Server': options.serverKey ?? 's1',
    'X-XBed-Timestamp': timestamp,
    'X-XBed-Nonce': nonce,
    'X-XBed-Signature': signature,
  };
}

export interface SamplePayloadOptions {
  matchId?: string;
  startedAt?: string;
  endedAt?: string;
  abnormal?: boolean;
  abnormalReason?: string | null;
  winnerTeam?: string | null;
  isDraw?: boolean;
  players?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function sampleMatchPayload(options: SamplePayloadOptions = {}): Record<string, unknown> {
  const now = Date.now();
  const startedAt = options.startedAt ?? new Date(now - 20 * 60_000).toISOString();
  const endedAt = options.endedAt ?? new Date(now - 5 * 60_000).toISOString();
  const { players, events, ...rest } = options;
  return {
    schemaVersion: 1,
    matchId: options.matchId ?? crypto.randomUUID(),
    arena: 'castle',
    arenaDisplay: '城堡争夺',
    mode: '4v4v4v4',
    startedAt,
    endedAt,
    endReason: 'team_eliminated',
    winnerTeam: options.winnerTeam === undefined ? '红队' : options.winnerTeam,
    isDraw: options.isDraw ?? false,
    abnormal: options.abnormal ?? false,
    abnormalReason: options.abnormalReason ?? null,
    players: players ?? [
      {
        uuid: crypto.randomUUID(),
        gameId: 'Steve',
        team: '红队',
        isWinner: true,
        kills: 8,
        finalKills: 2,
        deaths: 3,
        finalDeaths: 1,
        bedsBroken: 1,
        placement: 1,
      },
      {
        uuid: crypto.randomUUID(),
        gameId: 'Alex',
        team: '蓝队',
        isWinner: false,
        kills: 3,
        finalKills: 1,
        deaths: 5,
        finalDeaths: 2,
        bedsBroken: 0,
        placement: 2,
      },
    ],
    events: events ?? [
      { type: 'kill', at: startedAt, actor: 'Steve', target: 'Alex', team: '红队' },
    ],
    ...rest,
  };
}

/**
 * 测试辅助：让 payload 中的玩家在比赛开始前就已完成报名。
 * 生产逻辑只把「赛前已报名」的玩家关联到比赛，测试里统一在此补上报名记录，
 * 避免每个用例重复写报名步骤。
 */
export function ensureParticipantsRegistered(
  ctx: TestContext,
  payload: Record<string, unknown>,
  seasonId: number,
): void {
  const startedAtRaw = payload.startedAt;
  const startedAt = typeof startedAtRaw === 'string' ? Date.parse(startedAtRaw) : Date.now();
  const registeredAt = new Date((Number.isFinite(startedAt) ? startedAt : Date.now()) - 86_400_000).toISOString();
  const players = Array.isArray(payload.players) ? (payload.players as Array<{ gameId?: string }>) : [];
  for (const player of players) {
    if (!player?.gameId) continue;
    const user = ctx.db
      .prepare("SELECT id FROM users WHERE lower(game_id) = lower(?) AND status = 'active' LIMIT 1")
      .get(player.gameId) as { id: number } | undefined;
    if (!user) continue;
    ctx.db
      .prepare(
        `INSERT OR IGNORE INTO registrations (season_id, user_id, game_id, custom_data, state, created_at)
         VALUES (?, ?, ?, '{}', 'active', ?)`,
      )
      .run(seasonId, user.id, player.gameId, registeredAt);
    // 测试用例里报名时间通常是「现在」，而模拟比赛开始于过去；统一回填为赛前，保证可关联
    ctx.db
      .prepare('UPDATE registrations SET created_at = ? WHERE season_id = ? AND user_id = ?')
      .run(registeredAt, seasonId, user.id);
  }
}

export async function ingestMatch(
  ctx: TestContext,
  payload: Record<string, unknown>,
  options: {
    secret?: string;
    timestamp?: string;
    nonce?: string;
    serverKey?: string;
    signature?: string;
    skipParticipantRegistration?: boolean;
  } = {},
) {
  const seasonRow = ctx.db
    .prepare("SELECT id FROM seasons WHERE state = 'running' ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | undefined;
  if (seasonRow && !options.skipParticipantRegistration) {
    ensureParticipantsRegistered(ctx, payload, seasonRow.id);
  }
  const body = JSON.stringify(payload);
  const secret = options.secret ?? serverSecret(ctx);
  const headers = signIngest(secret, {
    body,
    timestamp: options.timestamp,
    nonce: options.nonce,
    serverKey: options.serverKey,
  });
  if (options.signature) headers['X-XBed-Signature'] = options.signature;
  return request(ctx.app)
    .post('/api/ingest/match')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}
