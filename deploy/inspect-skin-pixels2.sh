#!/bin/bash
SKIN=$(python3 -c "import json;print(json.load(open('/tmp/l.json'))['skin'])" 2>/dev/null)
curl -s -o /tmp/s.png "http://127.0.0.1:3000$SKIN"
cat > /tmp/pix.js <<'JS'
const sharp = require('/var/www/xuanjian-guild/node_modules/sharp');
(async () => {
  const { data, info } = await sharp('/tmp/s.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, ch = info.channels;
  const px = (x, y) => {
    const i = (y * w + x) * ch;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  console.log('尺寸', w, 'x', info.height, 'channels', ch);
  const pts = {
    '头(8,8)': [8, 8],
    '身体(20,20)': [20, 20],
    '身体中心(24,26)': [24, 26],
    '右臂(44,20)': [44, 20],
    '右臂(45,20)': [45, 20],
    '臂右缘46': [46, 20],
    '臂右缘47': [47, 20],
    '左臂(36,52)': [36, 52],
    '腿(4,20)': [4, 20],
    '腿(20,52)': [20, 52],
  };
  for (const [k, [x, y]] of Object.entries(pts)) console.log(' ', k, px(x, y));
})();
JS
node /tmp/pix.js 2>&1 | head -16
