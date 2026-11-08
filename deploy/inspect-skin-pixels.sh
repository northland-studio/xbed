#!/bin/bash
curl -s 'http://127.0.0.1:3000/api/skins/lookup?gameId=Morzane123' -o /tmp/l.json
SKIN=$(python3 -c "import json;print(json.load(open('/tmp/l.json'))['skin'])")
echo "skin: $SKIN"
curl -s -o /tmp/s.png "http://127.0.0.1:3000$SKIN"
python3 - <<'PY'
try:
    from PIL import Image
except ImportError:
    print('PIL 未安装')
    raise SystemExit(0)
im = Image.open('/tmp/s.png').convert('RGBA')
print('尺寸', im.size)
pts = {
    '头(8,8)': (8, 8),
    '身体(20,20)': (20, 20),
    '身体(24,26)': (24, 26),
    '右臂(44,20)': (44, 20),
    '臂右缘(47,20)': (47, 20),
    '臂右缘(46,20)': (46, 20),
    '左臂(36,52)': (36, 52),
    '腿(4,20)': (4, 20),
    '腿(20,52)': (20, 52),
}
for label, (x, y) in pts.items():
    print(f'  {label}: {im.getpixel((x, y))}')
PY
