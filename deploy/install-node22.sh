#!/bin/bash
set -e
echo "=== 安装独立 Node 22（仅 XBed 使用，不影响全局 node20 与既有 pm2 应用）==="
if [ -x /opt/node22/bin/node ]; then
  echo "已存在: $(/opt/node22/bin/node -v)"
  exit 0
fi
cd /tmp
VER=v22.11.0
URL1="https://npmmirror.com/mirrors/node/${VER}/node-${VER}-linux-x64.tar.xz"
URL2="https://nodejs.org/dist/${VER}/node-${VER}-linux-x64.tar.xz"
if ! curl -fsSL --max-time 300 -o node22.tar.xz "$URL1"; then
  echo "npmmirror 失败，改用官方源"
  curl -fsSL --max-time 300 -o node22.tar.xz "$URL2"
fi
mkdir -p /opt/node22
tar -xJf node22.tar.xz -C /opt/node22 --strip-components=1
rm -f node22.tar.xz
/opt/node22/bin/node -v
/opt/node22/bin/npm -v
echo "=== 完成 ==="
