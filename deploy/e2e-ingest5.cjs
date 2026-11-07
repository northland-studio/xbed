// 赛季窗口内的上报测试（startedAt = now-60s）
const crypto = require('crypto');
const http = require('http');
const [apiBase, serverKey, secret] = process.argv.slice(2);

function req(method, path, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto
    .createHmac('sha256', secret)
    .update([method, path, ts, nonce, crypto.createHash('sha256').update(body).digest('hex')].join('\n'))
    .digest('hex');
  const u = new URL(apiBase + path);
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-XBed-Server': serverKey,
          'X-XBed-Timestamp': ts,
          'X-XBed-Nonce': nonce,
          'X-XBed-Signature': sig,
        },
      },
      (resp) => {
        let d = '';
        resp.on('data', (c) => (d += c));
        resp.on('end', () => resolve({ status: resp.statusCode, body: d }));
      },
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  const now = Date.now();
  const payload = {
    schemaVersion: 1,
    matchId: crypto.randomUUID(),
    arena: 'castle',
    arenaDisplay: '城堡争夺',
    mode: '4v4v4v4',
    startedAt: new Date(now - 60 * 1000).toISOString(),
    endedAt: new Date(now).toISOString(),
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
      { type: 'kill', at: new Date(now - 40 * 1000).toISOString(), actor: 'TestPlayerA', target: 'TestPlayerB', team: '红队' },
      { type: 'bed_break', at: new Date(now - 30 * 1000).toISOString(), actor: 'TestPlayerA', team: '红队' },
    ],
  };
  const r1 = await req('POST', '/api/ingest/match', payload);
  console.log('上报:', r1.status, r1.body);
  const r2 = await req('POST', '/api/ingest/match', payload);
  console.log('重复:', r2.status, r2.body);
})();
