#!/bin/bash
#
# 一键启动 MCP 服务 + 认证代理 + 隧道
# 用法：./start-all.sh
#
# 前提：在华为云开发者空间中运行
#

set -e
cd "$(dirname "$0")"

echo "=== 0. 检查 Playwright Chromium 内核 ==="
CHROMIUM_BIN=""
for dir in /root/.cache/ms-playwright/chromium-*; do
  if [ -f "$dir/chrome-headless-shell-linux-arm64/chrome-headless-shell" ]; then
    CHROMIUM_BIN="$dir/chrome-headless-shell-linux-arm64/chrome-headless-shell"
    break
  fi
  if [ -f "$dir/chrome-linux/chrome" ]; then
    CHROMIUM_BIN="$dir/chrome-linux/chrome"
    break
  fi
done

if [ -n "$CHROMIUM_BIN" ]; then
  echo "   ✅ Chromium 已安装: $CHROMIUM_BIN"
else
  echo "   ⚠️ Chromium 未安装，开始安装..."
  # 安装系统依赖（openEuler）
  dnf install -y nss nspr atk at-spi2-atk cups-libs libdrm \
    libXcomposite libXdamage libXrandr mesa-libgbm pango \
    alsa-lib gtk3 libXtst 2>/dev/null || true
  # 安装 Chromium 内核
  npx playwright install chromium 2>&1 || {
    echo "   ❌ Chromium 安装失败，浏览器工具将不可用"
    echo "   手动重试: npx playwright install chromium"
  }
  echo "   ✅ Chromium 安装完成"
fi

echo ""
echo "=== 1. 检查 MCP 服务 (端口 9443) ==="
if ss -tlnp | grep -q ":9443 "; then
  echo "   ✅ MCP 服务已在运行"
else
  echo "   启动 MCP 服务..."
  nohup node dist/index.js > /tmp/mcp-server.log 2>&1 &
  echo "   ✅ MCP 服务已启动 (PID: $!)"
  sleep 3
fi

echo ""
echo "=== 2. 检查认证代理 (端口 9446) ==="
if ss -tlnp | grep -q ":9446 "; then
  echo "   ✅ 认证代理已在运行"
else
  echo "   启动认证代理..."
  nohup node proxy.mjs > /tmp/proxy.log 2>&1 &
  echo "   ✅ 代理已启动 (PID: $!)"
  sleep 2
fi

echo ""
echo "=== 3. 启动/续期隧道 ==="
./tunnel-manage.sh renew

echo ""
echo "=== 4. 验证 ==="
URL=$(./tunnel-manage.sh url)
echo "   公网地址: $URL"
echo ""
echo "   测试健康检查:"
curl -sk "$(dirname "$URL")/healthz" 2>&1 || echo "   ❌ 健康检查失败"
echo ""
echo "✅ 全部启动完成！"
