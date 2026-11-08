#!/bin/bash
echo "=== 竞技场加载情况 ==="
journalctl -u bedwars --since '-3 min' --no-pager 2>/dev/null | grep -ac 'Load done' | sed 's/^/  Load done 行数: /'
journalctl -u bedwars --since '-3 min' --no-pager 2>/dev/null | grep -aE 'Load done' | head -5
echo
echo "=== 启动完成 / 报错 ==="
journalctl -u bedwars --since '-3 min' --no-pager 2>/dev/null | grep -aE 'Done \(|MULTIARENA|ERROR\]|Could not load' | head -10
echo
echo "=== 端口 ==="
ss -lntp 2>/dev/null | grep -E ':25565|:25575'
echo
echo "=== RCON 测试 ==="
cat > /root/xbed-ping.txt <<'EOF'
xbedsync ping
xbedsync status
EOF
python3 - <<'PY'
import socket, struct, sys
host, port, pw = '127.0.0.1', 25575, 'xbedrcon2026'
def pack(req_id, typ, body):
    data = struct.pack('<ii', req_id, typ) + body.encode('utf-8') + b'\x00\x00'
    return struct.pack('<i', len(data)) + data
def recv_packet(s):
    ln = s.recv(4)
    if not ln: return None
    (length,) = struct.unpack('<i', ln)
    data = b''
    while len(data) < length:
        chunk = s.recv(length - len(data))
        if not chunk: break
        data += chunk
    rid, typ = struct.unpack('<ii', data[:8])
    return rid, typ, data[8:-2].decode('utf-8', 'ignore')
try:
    s = socket.create_connection((host, port), timeout=8)
    s.sendall(pack(1, 3, pw))
    recv_packet(s)
    for cmd in ['xbedsync ping', 'xbedsync status']:
        s.sendall(pack(2, 2, cmd))
        r = recv_packet(s)
        print('>>>', cmd)
        print('   ', (r[2] if r else '(无响应)')[:400])
    s.close()
except Exception as e:
    print('  RCON 连接失败:', e)
PY
