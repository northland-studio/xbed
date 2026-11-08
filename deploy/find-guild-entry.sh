#!/bin/bash
cd /var/www/xuanjian-guild || exit 1
echo "=== 目录 ==="
ls | head -20
echo
echo "=== 引用 routes/skins 的文件 ==="
grep -rln "routes/skins" --include='*.js' . 2>/dev/null | grep -v node_modules | head -5
echo
echo "=== 挂载相关行 ==="
grep -rn "skins" --include='*.js' . 2>/dev/null | grep -v node_modules | grep -E "require|\.use\(" | head -8
echo
echo "=== uploads 静态目录配置 ==="
grep -rn "uploads" --include='*.js' . 2>/dev/null | grep -v node_modules | grep -E "static|use\(" | head -8
