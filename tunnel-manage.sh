#!/bin/bash
#
# DevBridge 隧道管理脚本
# 用法：
#   ./tunnel-manage.sh status    # 查看隧道状态
#   ./tunnel-manage.sh renew     # 续期到 30 天（最大）
#   ./tunnel-manage.sh recreate  # 删除旧隧道并重新创建
#   ./tunnel-manage.sh url       # 获取公网 URL
#   ./tunnel-manage.sh stop      # 停止隧道
#
# 前提：在华为云开发者空间中运行（需要 DevBridge 沙箱和 job-env API）
#

set -e

# ===== 配置 =====
TUNNEL_ID="a36r3afl"
TUNNEL_NAME="browser-mcp-tunnel"
TUNNEL_DESC="浏览器MCP隧道"
TUNNEL_EXPIRE=720          # 720 小时 = 30 天（最大值）
PROXY_PORT=9446            # 认证注入代理端口
BACKEND_PORT=9443          # MCP 服务端口
API_KEY="changeme"         # 沙箱中服务的 API Key

# DevBridge skill 脚本路径
DB_CMD="/root/.agents/skills/huawei-cloud-jobenv-devbridge-tunnel/scripts/devbridge_cmd.sh"

if [ ! -f "$DB_CMD" ]; then
  echo "❌ 找不到 DevBridge skill: $DB_CMD"
  echo "   请确认在华为云开发者空间中运行"
  exit 1
fi

source "$DB_CMD"

case "${1:-status}" in

  status)
    echo "=== 隧道状态 ==="
    db_show "$TUNNEL_ID"
    echo ""
    echo "=== 端口配置 ==="
    db_port_list "$TUNNEL_ID"
    echo ""
    echo "=== 运行中的进程 ==="
    db_processes
    echo ""
    echo "=== 公网 URL ==="
    URL=$(db_tunnel_url "$TUNNEL_ID" 2>/dev/null)
    if [ -n "$URL" ]; then
      echo "  $URL/mcp"
    else
      echo "  （隧道未托管，运行 ./tunnel-manage.sh renew 启动）"
    fi
    ;;

  renew)
    echo "=== 1. 更新隧道有效期到 30 天 ==="
    db_update "$TUNNEL_ID" "$TUNNEL_NAME" "$TUNNEL_DESC" "$TUNNEL_EXPIRE"
    echo ""

    echo "=== 2. 停止旧的 host 进程 ==="
    PIDS=$(db_processes | python3 -c "
import json,sys
procs = json.load(sys.stdin)
for p in procs:
    if p['tunnelId'] == '$TUNNEL_ID' and p['status'] == 'running':
        print(p['id'])
" 2>/dev/null)
    for pid in $PIDS; do
      db_process_stop "$pid" 2>/dev/null || true
    done
    sleep 2
    echo ""

    echo "=== 3. 重新启动托管 ==="
    PID=$(db_host "$TUNNEL_ID")
    echo "   Host PID: $PID"
    sleep 3

    URL=$(db_tunnel_url "$TUNNEL_ID")
    echo ""
    echo "✅ 续期完成！"
    echo "   公网 URL: $URL/mcp"
    echo "   有效期: 30 天"
    ;;

  recreate)
    echo "=== 1. 删除旧隧道 ==="
    # 停止所有进程
    PIDS=$(db_processes | python3 -c "
import json,sys
procs = json.load(sys.stdin)
for p in procs:
    if p['tunnelId'] == '$TUNNEL_ID':
        print(p['id'])
" 2>/dev/null)
    for pid in $PIDS; do
      db_process_stop "$pid" 2>/dev/null || true
    done
    sleep 2
    db_delete "$TUNNEL_ID" 2>/dev/null || true
    echo ""

    echo "=== 2. 创建新隧道 ==="
    NEW_ID=$(db_create "$TUNNEL_NAME" "$TUNNEL_DESC" "$TUNNEL_EXPIRE")
    echo "   新 Tunnel ID: $NEW_ID"
    echo ""

    echo "=== 3. 配置端口 ==="
    db_port_create "$NEW_ID" "$PROXY_PORT" http true
    echo ""

    echo "=== 4. 启动托管 ==="
    PID=$(db_host "$NEW_ID")
    echo "   Host PID: $PID"
    sleep 3

    URL=$(db_tunnel_url "$NEW_ID")
    echo ""
    echo "✅ 重建完成！"
    echo "   新公网 URL: $URL/mcp"
    echo "   新 Tunnel ID: $NEW_ID"
    echo ""
    echo "   ⚠️ URL 已变更，需要更新客户端配置！"
    echo "   请把脚本中的 TUNNEL_ID 更新为: $NEW_ID"
    ;;

  url)
    URL=$(db_tunnel_url "$TUNNEL_ID" 2>/dev/null)
    if [ -n "$URL" ]; then
      echo "$URL/mcp"
    else
      echo "❌ 隧道未托管，运行 ./tunnel-manage.sh renew 启动"
      exit 1
    fi
    ;;

  stop)
    echo "=== 停止所有隧道进程 ==="
    PIDS=$(db_processes | python3 -c "
import json,sys
procs = json.load(sys.stdin)
for p in procs:
    if p['tunnelId'] == '$TUNNEL_ID':
        print(p['id'])
" 2>/dev/null)
    for pid in $PIDS; do
      echo "  停止 $pid"
      db_process_stop "$pid"
    done
    echo "✅ 已停止"
    ;;

  *)
    echo "用法: $0 {status|renew|recreate|url|stop}"
    echo ""
    echo "  status   - 查看隧道状态和公网 URL"
    echo "  renew    - 续期到 30 天并重新托管（URL 不变）"
    echo "  recreate - 删除旧隧道并重建（URL 会变）"
    echo "  url      - 只输出公网 URL"
    echo "  stop     - 停止隧道托管"
    exit 1
    ;;

esac
