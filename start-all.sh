#!/bin/bash
#
# 一键启动 MCP 服务 + 认证代理 + 隧道
# 用法：./start-all.sh
#
# 前提：在华为云开发者空间中运行
#

set -e
cd "$(dirname "$0")"

echo "=== 1. 检查 MCP 服务 (端口 9443) ==="
if ss -tlnp | grep -q ":9443 "; then
  echo "   ✅ MCP 服务已在运行"
else
  echo "   ⚠️ MCP 服务未运行"
  echo "   注意：沙箱中的服务由 CodeArts 管理，通常不需要手动启动"
  echo "   如果服务挂了，在 CodeArts 终端中运行: cd browser-remote-mcp && npm start"
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
