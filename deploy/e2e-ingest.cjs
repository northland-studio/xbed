// 模拟插件上报：HMAC 签名 + 幂等验证
// 用法：node e2e-ingest.cjs <apiBase> <serverKey> <secret>
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const [apiBase, serverKey, secret] = process.argv.slice(2);
if (!apiBase || !serverKey || !secret) {
  console.error('用法: node e2e-ingest.cjs <apiBase> <serverKey> <secret>');
  process.exit(1);
}

function request(method, path, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const canonical = [method, path, timestamp, nonce, bodyHash].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  const url = new URL(apiBase + path);
  const lib = url.protocol === 'https:' ? https : http;
  const opts = {
    method,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-XBed-Server': serverKey,
      'X-XBed-Timestamp': timestamp,
      'X-XBed-Nonce': nonce,
      'X-XBed-Signature': signature,
    },
  };
  return new Promise((resolve, reject) => {
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const matchId = crypto.randomUUID();
  const now = Date.now();
  const payload = {
    schemaVersion: 1,
    matchId,
    arena: 'castle',
    arenaDisplay: '城堡争夺',
    mode: '4v4v4v4',
    startedAt: new Date(now - 20 * 60 * 1000).toISOString(),
    endedAt: new Date(now - 2 * 60 * 1000).toISOString(),
    endReason: 'team_eliminated',
    winnerTeam: '红队',
    isDraw: false,
    abnormal: false,
    abnormalReason: null,
    players: [
      { uuid: '11111111-1111-1111-1111-111111111111', gameId: 'TestPlayerA', team: '红队', isWinner: true, kills: 8, finalKills: 2, deaths: 3, finalDeaths: 1, bedsBroken: 1, placement: 1 },
      { uuid: '22222222-2222-2222-2222-222222222222', gameId: 'TestPlayerB', team: '蓝队', isWinner: false, kills: 3, finalKills: 0, deaths: 6, finalDeaths: 2, bedsBroken: 0, placement: 2 },
    ],
    events: [
      { type: 'kill', at: new Date(now - 15 * 60 * 1000).toISOString(), actor: 'TestPlayerA', target: 'TestPlayerB', team: '红队' },
      { type: 'bed_break', at: new Date(now - 10 * 60 * 1000).toISOString(), actor: 'TestPlayerA', team: '红队' },
      { type: 'team_eliminated', at: new Date(now - 3 * 60 * 1000).toISOString(), team: '蓝队' },
    ],
  };

  console.log('=== 1. 首次上报 ===');
  const r1 = await request('POST', '/api/ingest/match', payload);
  console.log('  HTTP', r1.status, r1.body.slice(0, 300));

  console.log('=== 2. 重复上报（幂等）===');
  const r2 = await request('POST', '/api/ingest/match', payload);
  console.log('  HTTP', r2.status, r2.body.slice(0, 300));

  console.log('=== 3. 错误签名 ===');
  const bad = await request('POST', '/api/ingest/match', payload);
  console.log('  （签名正确，跳过；由单测覆盖错误签名）');
  console.log('matchId =', matchId);
})();
