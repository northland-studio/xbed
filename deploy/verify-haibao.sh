#!/bin/bash
F=/opt/xbed-bedwars/plugins/Images/haibao.png
ls -lh "$F" 2>/dev/null || { echo "文件不存在"; exit 1; }
python3 - "$F" <<'PY'
import struct, sys
p = sys.argv[1]
with open(p, 'rb') as fh:
    head = fh.read(33)
if head[:8] != b'\x89PNG\r\n\x1a\n':
    print('不是合法 PNG 文件')
    raise SystemExit(1)
w, h = struct.unpack('>II', head[16:24])
print(f'PNG 校验通过，尺寸: {w} x {h}')
print('注意：Images 插件按 128px/格 计算，换算约占', -(-w // 128), 'x', -(-h // 128), '个方块格')
PY
echo
echo "=== Images 目录当前内容 ==="
ls -lh /opt/xbed-bedwars/plugins/Images/ | head -12
