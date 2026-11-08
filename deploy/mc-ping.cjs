// 通过 Server List Ping 读取 MOTD / 在线人数 / 版本
const net = require('net');
const host = process.argv[2] || '189.105.72.119';
const port = Number(process.argv[3] || 25565);

function varint(n) {
  const out = [];
  while (true) {
    let b = n & 0x7f;
    n >>>= 7;
    if (n !== 0) b |= 0x80;
    out.push(b);
    if (n === 0) break;
  }
  return Buffer.from(out);
}
function packet(id, payload) {
  const body = Buffer.concat([varint(id), payload]);
  return Buffer.concat([varint(body.length), body]);
}
function str(s) {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([varint(b.length), b]);
}

const sock = net.connect(port, host, () => {
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port);
  const handshake = packet(0x00, Buffer.concat([varint(47), str(host), portBuf, varint(1)]));
  sock.write(Buffer.concat([handshake, packet(0x00, Buffer.alloc(0))]));
});

let buf = Buffer.alloc(0);
const timer = setTimeout(() => {
  console.log('超时：未收到响应');
  sock.destroy();
  process.exit(1);
}, 8000);

sock.on('data', (data) => {
  buf = Buffer.concat([buf, data]);
  // 解析 varint 长度
  let len = 0, shift = 0, i = 0, cont = true;
  while (i < buf.length && cont) {
    const b = buf[i++];
    len |= (b & 0x7f) << shift;
    shift += 7;
    if ((b & 0x80) === 0) cont = false;
  }
  if (cont || buf.length - i < len) return;
  const payload = buf.subarray(i, i + len);
  // packet id + string length varint
  let j = 1;
  let slen = 0; shift = 0; cont = true;
  while (j < payload.length && cont) {
    const b = payload[j++];
    slen |= (b & 0x7f) << shift;
    shift += 7;
    if ((b & 0x80) === 0) cont = false;
  }
  const json = JSON.parse(payload.subarray(j, j + slen).toString('utf8'));
  clearTimeout(timer);
  console.log('=== ' + host + ':' + port + ' ===');
  console.log('version :', JSON.stringify(json.version));
  console.log('players :', JSON.stringify(json.players));
  console.log('MOTD    :', JSON.stringify(json.description));
  sock.destroy();
  process.exit(0);
});

sock.on('error', (e) => {
  clearTimeout(timer);
  console.log('连接失败:', e.message);
  process.exit(1);
});
