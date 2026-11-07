const crypto = require('crypto');
const http = require('http');
const [apiBase, serverKey, secret] = process.argv.slice(2);
function req(method, path, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const ts = Math.floor(Date.now()/1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto.createHmac('sha256', secret).update([method, path, ts, nonce, crypto.createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');
  const u = new URL(apiBase + path);
  return new Promise((res, rej) => {
    const r = http.request({ method, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { 'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),
        'X-XBed-Server':serverKey,'X-XBed-Timestamp':ts,'X-XBed-Nonce':nonce,'X-XBed-Signature':sig } },
      (resp) => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>res({status:resp.statusCode, body:d})); });
    r.on('error', rej); if (body) r.write(body); r.end();
  });
}
(async () => {
  const now = Date.now();
  const payload = { schemaVersion:1, matchId: crypto.randomUUID(), arena:'blossom', arenaDisplay:'樱色花园', mode:'4v4v4v4',
    startedAt: new Date(now-5*60*1000).toISOString(), endedAt: new Date(now-1*60*1000).toISOString(),
    endReason:'team_eliminated', winnerTeam:'蓝队', isDraw:false, abnormal:false, abnormalReason:null,
    players:[{uuid:'33333333-3333-3333-3333-333333333333',gameId:'TestC',team:'蓝队',isWinner:true,kills:5,finalKills:1,deaths:2,finalDeaths:0,bedsBroken:2,placement:1},
             {uuid:'44444444-4444-4444-4444-444444444444',gameId:'TestD',team:'红队',isWinner:false,kills:2,finalKills:0,deaths:5,finalDeaths:2,bedsBroken:0,placement:2}],
    events:[{type:'kill',at:new Date(now-20*60*1000).toISOString(),actor:'TestC',target:'TestD',team:'蓝队'}] };
  const r1 = await req('POST','/api/ingest/match',payload);
  console.log('上报:', r1.status, r1.body.slice(0,260));
  const r2 = await req('POST','/api/ingest/match',payload);
  console.log('重复:', r2.status, r2.body.slice(0,200));
})();
