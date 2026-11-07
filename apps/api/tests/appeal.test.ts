import crypto from 'node:crypto';
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
let l1Cookie: string;
let steve: ReturnType<typeof registerPlayer>;
let alex: ReturnType<typeof registerPlayer>;

async function setupApprovedMatch(): Promise<number> {
  const payload = sampleMatchPayload({
    players: [
      { gameId: 'Steve', team: '红队', isWinner: true, kills: 8, deaths: 3, bedsBroken: 1, placement: 1 },
      { gameId: 'Alex', team: '蓝队', isWinner: false, kills: 3, deaths: 5, bedsBroken: 0, placement: 2 },
    ],
  });
  const ingest = await ingestMatch(ctx, payload);
  expect(ingest.status).toBe(200);
  const review = await request(ctx.app)
    .post(`/api/admin/matches/${ingest.body.matchId}/review`)
    .set('Cookie', l1Cookie)
    .send({ action: 'approve' });
  expect(review.status).toBe(200);
  return ingest.body.matchId as number;
}

beforeEach(() => {
  ctx = createTestContext();
  setSeasonRunning(ctx.db, ctx.seed.seasonId);
  const l1 = createUser(ctx.db, { level: 1, nickname: '管理员' });
  l1Cookie = createSessionFor(ctx.db, l1).cookie;
  steve = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'Steve', gameId: 'Steve' });
  alex = registerPlayer(ctx.db, ctx.seed.seasonId, { nickname: 'Alex', gameId: 'Alex' });
});

afterEach(() => {
  cleanupTestFiles(ctx);
  ctx.db.close();
});

describe('赛果申诉', () => {
  it('48 小时内可申诉；非参赛玩家不可申诉；赛果未公布不可申诉', async () => {
    const outsider = createUser(ctx.db, { nickname: '路人', gameId: 'Outsider' });
    const outsiderCookie = createSessionFor(ctx.db, outsider).cookie;

    // 未公布前
    const pending = await ingestMatch(
      ctx,
      sampleMatchPayload({
        players: [{ gameId: 'Steve', team: '红队', isWinner: true, kills: 1, deaths: 0 }],
      }),
    );
    const beforePublish = await request(ctx.app)
      .post(`/api/matches/${pending.body.matchId}/appeals`)
      .set('Cookie', steve.cookie)
      .send({ type: 'result', content: '我认为这场比赛的判定有误' });
    expect(beforePublish.status).toBe(409);

    const matchId = await setupApprovedMatch();

    const nonParticipant = await request(ctx.app)
      .post(`/api/matches/${matchId}/appeals`)
      .set('Cookie', outsiderCookie)
      .send({ type: 'result', content: '路人申诉请求复核' });
    expect(nonParticipant.status).toBe(403);

    const ok = await request(ctx.app)
      .post(`/api/matches/${matchId}/appeals`)
      .set('Cookie', steve.cookie)
      .send({ type: 'result', content: '击杀数据与日志不符，申请复核' });
    expect(ok.status).toBe(200);
    expect(ok.body.appeal.state).toBe('open');
    expect(ok.body.appeal.matchId).toBe(matchId);

    const mine = await request(ctx.app).get('/api/me/appeals').set('Cookie', steve.cookie);
    expect(mine.status).toBe(200);
    expect(mine.body.total).toBe(1);
    expect(mine.body.items[0].type).toBe('result');
  });

  it('超过 48 小时 → deadline_passed', async () => {
    const matchId = await setupApprovedMatch();
    const old = new Date(Date.now() - 49 * 3_600_000).toISOString();
    ctx.db.prepare('UPDATE matches SET reviewed_at = ? WHERE id = ?').run(old, matchId);
    const res = await request(ctx.app)
      .post(`/api/matches/${matchId}/appeals`)
      .set('Cookie', steve.cookie)
      .send({ type: 'points', content: '积分结算错误，申请复核' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('deadline_passed');
  });

  it('本人追加说明 → 状态进入 processing；管理员回复与裁决（写审计与通知）', async () => {
    const matchId = await setupApprovedMatch();
    const create = await request(ctx.app)
      .post(`/api/matches/${matchId}/appeals`)
      .set('Cookie', steve.cookie)
      .send({ type: 'result', content: '赛果判定有误，申请复核' });
    const appealId = create.body.appeal.id;

    const reply = await request(ctx.app)
      .post(`/api/appeals/${appealId}/replies`)
      .set('Cookie', steve.cookie)
      .send({ content: '补充：第 8 分钟击杀记录缺失' });
    expect(reply.status).toBe(200);
    expect(reply.body.appeal.state).toBe('processing');
    expect(reply.body.appeal.replies.length).toBe(1);

    // 管理员回复
    const adminReply = await request(ctx.app)
      .post(`/api/admin/appeals/${appealId}/reply`)
      .set('Cookie', l1Cookie)
      .send({ content: '已收到，正在核对日志' });
    expect(adminReply.status).toBe(200);

    // 管理员裁决
    const resolve = await request(ctx.app)
      .post(`/api/admin/appeals/${appealId}/resolve`)
      .set('Cookie', l1Cookie)
      .send({ state: 'resolved', result: '赛果数据无误，维持原判', note: '核对三方证据一致' });
    expect(resolve.status).toBe(200);
    expect(resolve.body.appeal.state).toBe('resolved');
    expect(resolve.body.appeal.resultNote).toBe('核对三方证据一致');

    const detail = await request(ctx.app).get(`/api/appeals/${appealId}`).set('Cookie', steve.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.replies.length).toBeGreaterThanOrEqual(3);

    const notification = ctx.db
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'appeal_resolved'")
      .all(steve.user.id);
    expect(notification.length).toBe(1);

    const audit = ctx.db
      .prepare("SELECT * FROM audit_logs WHERE action = 'appeal.resolve'")
      .all();
    expect(audit.length).toBe(1);

    // 已处理完毕不能追加
    const afterResolved = await request(ctx.app)
      .post(`/api/appeals/${appealId}/replies`)
      .set('Cookie', steve.cookie)
      .send({ content: '再补充' });
    expect(afterResolved.status).toBe(409);
  });

  it('他人不可查看申诉详情，管理员可查看', async () => {
    const matchId = await setupApprovedMatch();
    const create = await request(ctx.app)
      .post(`/api/matches/${matchId}/appeals`)
      .set('Cookie', steve.cookie)
      .send({ type: 'result', content: '申诉详情内容测试' });
    const appealId = create.body.appeal.id;

    const forbidden = await request(ctx.app)
      .get(`/api/appeals/${appealId}`)
      .set('Cookie', alex.cookie);
    expect(forbidden.status).toBe(403);

    const admin = await request(ctx.app).get(`/api/appeals/${appealId}`).set('Cookie', l1Cookie);
    expect(admin.status).toBe(200);
  });

  it('申诉内容过短 → 400', async () => {
    const matchId = await setupApprovedMatch();
    const res = await request(ctx.app)
      .post(`/api/matches/${matchId}/appeals`)
      .set('Cookie', steve.cookie)
      .send({ type: 'result', content: 'x' });
    expect(res.status).toBe(400);
  });

  it('申诉附件：本人可上传/下载（写审计），他人不可上传或下载，GET 详情返回列表', async () => {
    const matchId = await setupApprovedMatch();
    const create = await request(ctx.app)
      .post(`/api/matches/${matchId}/appeals`)
      .set('Cookie', steve.cookie)
      .send({ type: 'result', content: '申请复核赛果数据' });
    const appealId = create.body.appeal.id as number;

    const upload = await request(ctx.app)
      .post(`/api/appeals/${appealId}/attachments`)
      .set('Cookie', steve.cookie)
      .attach('file', Buffer.from('screenshot-bytes'), 'evidence.png');
    expect(upload.status).toBe(200);
    expect(upload.body.attachment.fileName).toBe('evidence.png');
    expect(upload.body.attachment.sha256).toHaveLength(64);

    const detail = await request(ctx.app).get(`/api/appeals/${appealId}`).set('Cookie', steve.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.attachments).toHaveLength(1);
    expect(detail.body.attachments[0].downloadUrl).toContain(`/api/appeals/${appealId}/attachments/`);

    const download = await request(ctx.app)
      .get(`/api/appeals/${appealId}/attachments/${upload.body.attachment.id}/download`)
      .set('Cookie', steve.cookie);
    expect(download.status).toBe(200);
    const downloadedText = Buffer.isBuffer(download.body)
      ? download.body.toString('utf8')
      : download.text;
    expect(downloadedText).toBe('screenshot-bytes');
    expect(
      (ctx.db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'appeal.attachment_download'").get() as {
        c: number;
      }).c,
    ).toBe(1);

    const otherUpload = await request(ctx.app)
      .post(`/api/appeals/${appealId}/attachments`)
      .set('Cookie', alex.cookie)
      .attach('file', Buffer.from('x'), 'x.png');
    expect(otherUpload.status).toBe(403);

    const otherDownload = await request(ctx.app)
      .get(`/api/appeals/${appealId}/attachments/${upload.body.attachment.id}/download`)
      .set('Cookie', alex.cookie);
    expect(otherDownload.status).toBe(403);

    const adminDownload = await request(ctx.app)
      .get(`/api/appeals/${appealId}/attachments/${upload.body.attachment.id}/download`)
      .set('Cookie', l1Cookie);
    expect(adminDownload.status).toBe(200);
  });

  it('申诉附件类型白名单：.exe → 400 invalid_file_type', async () => {
    const matchId = await setupApprovedMatch();
    const create = await request(ctx.app)
      .post(`/api/matches/${matchId}/appeals`)
      .set('Cookie', steve.cookie)
      .send({ type: 'result', content: '附件类型测试内容' });
    const res = await request(ctx.app)
      .post(`/api/appeals/${create.body.appeal.id}/attachments`)
      .set('Cookie', steve.cookie)
      .attach('file', Buffer.from('MZ'), 'malware.exe');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_file_type');
  });
});

function _unused(value: unknown): unknown {
  return value ?? crypto.randomUUID();
}
