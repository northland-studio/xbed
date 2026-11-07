import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupTestFiles,
  createSessionFor,
  createTestContext,
  createUser,
  ingestMatch,
  registerPlayer,
  sampleMatchPayload,
  setSeasonRunning,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;

async function setupMatch(endedMinutesAgo = 5): Promise<{ matchId: number; steveCookie: string; steveId: number }> {
  setSeasonRunning(ctx.db, ctx.seed.seasonId);
  const steve = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'Steve', gameId: 'Steve' });
  const alex = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'Alex', gameId: 'Alex' });
  const now = Date.now();
  const payload = sampleMatchPayload({
    startedAt: new Date(now - (endedMinutesAgo + 15) * 60_000).toISOString(),
    endedAt: new Date(now - endedMinutesAgo * 60_000).toISOString(),
    players: [
      { gameId: 'Steve', team: '红队', isWinner: true, kills: 8, deaths: 3, bedsBroken: 1, placement: 1 },
      { gameId: 'Alex', team: '蓝队', isWinner: false, kills: 3, deaths: 5, bedsBroken: 0, placement: 2 },
    ],
  });
  const res = await ingestMatch(ctx, payload);
  expect(res.status).toBe(200);
  return { matchId: res.body.matchId as number, steveCookie: steve.cookie, steveId: steve.user.id };
}

beforeEach(() => {
  ctx = createTestContext();
});
afterEach(() => {
  cleanupTestFiles(ctx);
  ctx.db.close();
});

describe('证据上传（latest.log / .mcpr）', () => {
  it('正常上传 latest.log：流式 SHA-256、状态 submitted、文件落盘', async () => {
    const { matchId, steveCookie } = await setupMatch();
    const content = '22:00:00 [Client thread/INFO]: Steve joined the game\n';
    const res = await request(ctx.app)
      .post(`/api/matches/${matchId}/evidence/log`)
      .set('Cookie', steveCookie)
      .attach('file', Buffer.from(content, 'utf8'), 'latest.log');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('submitted');
    expect(res.body.isLate).toBe(false);
    const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
    expect(res.body.evidence.sha256).toBe(expectedHash);
    expect(res.body.evidence.sizeBytes).toBe(Buffer.byteLength(content));

    const evidence = ctx.db
      .prepare('SELECT * FROM match_evidence WHERE id = ?')
      .get(res.body.evidence.id) as { stored_path: string; sha256: string };
    expect(evidence.sha256).toBe(expectedHash);
    expect(evidence.stored_path).toMatch(/^logs\/\d+\/[0-9a-f]{32}\.log$/);
    const absolute = path.resolve(ctx.config.filesDir, evidence.stored_path);
    expect(fs.existsSync(absolute)).toBe(true);
    expect(fs.readFileSync(absolute, 'utf8')).toBe(content);

    const submission = ctx.db
      .prepare('SELECT * FROM match_logs WHERE match_id = ? AND user_id = ?')
      .get(matchId, res.body.evidence.userId) as { state: string; evidence_id: number };
    expect(submission.state).toBe('submitted');
    expect(submission.evidence_id).toBe(res.body.evidence.id);
  });

  it('逾期上传标记 is_late / state=late', async () => {
    const { matchId, steveCookie } = await setupMatch(120);
    const res = await request(ctx.app)
      .post(`/api/matches/${matchId}/evidence/log`)
      .set('Cookie', steveCookie)
      .attach('file', Buffer.from('late log'), 'latest.log');
    expect(res.status).toBe(200);
    expect(res.body.isLate).toBe(true);
    expect(res.body.state).toBe('late');
    const lateValue = ctx.db
      .prepare('SELECT is_late FROM match_evidence WHERE id = ?')
      .get(res.body.evidence.id) as { is_late: number };
    expect(lateValue.is_late).toBe(1);
  });

  it('上传 .mcpr 回放成功并写入 match_replays', async () => {
    const { matchId, steveCookie } = await setupMatch();
    const res = await request(ctx.app)
      .post(`/api/matches/${matchId}/evidence/replay`)
      .set('Cookie', steveCookie)
      .attach('file', Buffer.from('MCPR-FAKE-DATA'), 'replay.mcpr');
    expect(res.status).toBe(200);
    const replay = ctx.db
      .prepare('SELECT * FROM match_replays WHERE match_id = ? AND user_id = ?')
      .get(matchId, res.body.evidence.userId) as { state: string };
    expect(replay.state).toBe('submitted');
    const stored = ctx.db
      .prepare('SELECT stored_path FROM match_evidence WHERE id = ?')
      .get(res.body.evidence.id) as { stored_path: string };
    expect(stored.stored_path).toMatch(/^replays\/\d+\/[0-9a-f]{32}\.mcpr$/);
  });

  it('扩展名白名单：.exe → 400 invalid_file_type', async () => {
    const { matchId, steveCookie } = await setupMatch();
    const res = await request(ctx.app)
      .post(`/api/matches/${matchId}/evidence/log`)
      .set('Cookie', steveCookie)
      .attach('file', Buffer.from('MZ'), 'virus.exe');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_file_type');
    expect(ctx.db.prepare('SELECT COUNT(*) AS c FROM match_evidence').get()).toEqual({ c: 0 });
  });

  it('文件超过大小限制 → 413 file_too_large，不残留文件', async () => {
    const smallCtx = createTestContext({
      limits: {
        uploadMaxLogBytes: 1024,
        uploadMaxReplayBytes: 2048,
        evidenceDeadlineMinutes: 60,
        appealDeadlineHours: 48,
      },
    });
    try {
      setSeasonRunning(smallCtx.db, smallCtx.seed.seasonId);
      const steve = registerPlayer(smallCtx.db, smallCtx.seed.seasonId, {
        nickname: 'Steve',
        gameId: 'Steve',
      });
      const payload = sampleMatchPayload({
        players: [{ gameId: 'Steve', team: '红队', isWinner: true, kills: 1, deaths: 0 }],
        startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        endedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      });
      const ingest = await ingestMatch(smallCtx, payload);
      expect(ingest.status).toBe(200);
      const res = await request(smallCtx.app)
        .post(`/api/matches/${ingest.body.matchId}/evidence/log`)
        .set('Cookie', steve.cookie)
        .attach('file', Buffer.alloc(4096, 'a'), 'big.log');
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('file_too_large');
      const dir = path.resolve(smallCtx.config.filesDir, 'logs');
      const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }) : [];
      expect(entries.some((entry) => String(entry).endsWith('.log'))).toBe(false);
    } finally {
      cleanupTestFiles(smallCtx);
      smallCtx.db.close();
    }
  });

  it('非参赛玩家上传 → 403；未登录 → 401', async () => {
    const { matchId } = await setupMatch();
    const outsider = createUser(ctx.db, { nickname: '路人', gameId: 'Outsider' });
    const outsiderSession = createSessionFor(ctx.db, outsider);
    const res = await request(ctx.app)
      .post(`/api/matches/${matchId}/evidence/log`)
      .set('Cookie', outsiderSession.cookie)
      .attach('file', Buffer.from('x'), 'latest.log');
    expect(res.status).toBe(403);

    const anonymous = await request(ctx.app)
      .post(`/api/matches/${matchId}/evidence/log`)
      .attach('file', Buffer.from('x'), 'latest.log');
    expect(anonymous.status).toBe(401);
  });

  it('我的证据状态查询 + 本人下载（含审计），他人下载 403', async () => {
    const { matchId, steveCookie } = await setupMatch();
    const upload = await request(ctx.app)
      .post(`/api/matches/${matchId}/evidence/log`)
      .set('Cookie', steveCookie)
      .attach('file', Buffer.from('log-content'), 'latest.log');
    expect(upload.status).toBe(200);

    const status = await request(ctx.app)
      .get(`/api/me/matches/${matchId}/evidence`)
      .set('Cookie', steveCookie);
    expect(status.status).toBe(200);
    expect(status.body.logs.state).toBe('submitted');
    expect(status.body.logs.evidenceId).toBe(upload.body.evidence.id);
    expect(status.body.replay.state).toBe('missing');
    expect(status.body.deadline).toBeTruthy();

    const download = await request(ctx.app)
      .get(`/api/me/matches/${matchId}/evidence/${upload.body.evidence.id}/download`)
      .set('Cookie', steveCookie);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.text).toBe('log-content');
    const audit = ctx.db
      .prepare("SELECT * FROM audit_logs WHERE action = 'evidence.download'")
      .all();
    expect(audit.length).toBe(1);

    const alex = ctx.db
      .prepare('SELECT * FROM users WHERE game_id = ?')
      .get('Alex') as unknown as import('../src/db/models.js').UserRow;
    const alexCookie = createSessionFor(ctx.db, alex).cookie;
    const forbidden = await request(ctx.app)
      .get(`/api/me/matches/${matchId}/evidence/${upload.body.evidence.id}/download`)
      .set('Cookie', alexCookie);
    expect(forbidden.status).toBe(403);
  });

  it('路径穿越防护：数据库中的非法 stored_path 无法读取', async () => {
    const { matchId, steveCookie, steveId } = await setupMatch();
    const info = ctx.db
      .prepare(
        `INSERT INTO match_evidence (match_id, user_id, kind, original_name, stored_path, size_bytes, sha256)
         VALUES (?, ?, 'latest_log', 'evil.log', '../../../../etc/passwd', 10, 'deadbeef')`,
      )
      .run(matchId, steveId);
    const res = await request(ctx.app)
      .get(`/api/me/matches/${matchId}/evidence/${Number(info.lastInsertRowid)}/download`)
      .set('Cookie', steveCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });
});
