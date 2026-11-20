#!/bin/bash
#
# supervisor.sh — 永久守护进程
# 监控 MCP Server (9443) + Proxy (9446) + DevBridge 隧道，挂了自动重启
#
# 用法：
#   ./supervisor.sh start    # 后台启动守护（nohup）
#   ./supervisor.sh stop     # 停止守护和所有服务
#   ./supervisor.sh status   # 查看状态
#   ./supervisor.sh run      # 前台运行（调试用）
#
# 配合 crontab 实现开机自启：
#   */2 * * * * /root/workspace/browser-remote-mcp/supervisor.sh start >/dev/null 2>&1
#

set -euo pipefail
cd "$(dirname "$0")"

# ===== 配置 =====
MCP_PORT=9443
PROXY_PORT=9446
TUNNEL_ID="a36r3afl"
CHECK_INTERVAL=30          # 每 30 秒检查一次
HEALTH_FAIL_THRESHOLD=3    # 连续 3 次健康检查失败才重启
LOG_DIR="/tmp/browser-mcp-supervisor"
PID_FILE="$LOG_DIR/supervisor.pid"
DB_CMD="/root/.agents/skills/huawei-cloud-jobenv-devbridge-tunnel/scripts/devbridge_cmd.sh"

mkdir -p "$LOG_DIR"

# ===== 工具函数 =====
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_DIR/supervisor.log"; }

is_listening() { ss -tlnp 2>/dev/null | grep -q ":$1 "; }

start_mcp() {
    if is_listening "$MCP_PORT"; then return 0; fi
    log "启动 MCP Server (端口 $MCP_PORT)..."
    nohup node dist/index.js > "$LOG_DIR/mcp-server.log" 2>&1 &
    echo $! > "$LOG_DIR/mcp-server.pid"
    sleep 3
    if is_listening "$MCP_PORT"; then
        log "✅ MCP Server 已启动 (PID $(cat "$LOG_DIR/mcp-server.pid"))"
    else
        log "❌ MCP Server 启动失败，查看日志："
        tail -5 "$LOG_DIR/mcp-server.log" >> "$LOG_DIR/supervisor.log" 2>/dev/null || true
    fi
}

start_proxy() {
    if is_listening "$PROXY_PORT"; then return 0; fi
    log "启动 Proxy (端口 $PROXY_PORT)..."
    nohup node proxy.mjs > "$LOG_DIR/proxy.log" 2>&1 &
    echo $! > "$LOG_DIR/proxy.pid"
    sleep 2
    if is_listening "$PROXY_PORT"; then
        log "✅ Proxy 已启动 (PID $(cat "$LOG_DIR/proxy.pid"))"
    else
        log "❌ Proxy 启动失败"
        tail -5 "$LOG_DIR/proxy.log" >> "$LOG_DIR/supervisor.log" 2>/dev/null || true
    fi
}

# 健康检查：通过代理访问后端 healthz
health_check() {
    local code
    code=$(curl -sk -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 \
        "http://localhost:$PROXY_PORT/healthz" 2>/dev/null || echo "000")
    if [ "$code" = "200" ]; then
        return 0
    else
        log "⚠️ 健康检查失败 (HTTP $code)"
        return 1
    fi
}

# 重启 MCP Server（先杀旧进程）
restart_mcp() {
    log "🔄 重启 MCP Server..."
    if [ -f "$LOG_DIR/mcp-server.pid" ]; then
        kill "$(cat "$LOG_DIR/mcp-server.pid")" 2>/dev/null || true
        sleep 1
    fi
    # 兜底：按端口杀
    local pid
    pid=$(ss -tlnp 2>/dev/null | grep ":$MCP_PORT " | grep -oP 'pid=\K[0-9]+' | head -1)
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    sleep 1
    start_mcp
}

# 维护 DevBridge 隧道 host 进程
maintain_tunnel() {
    if [ ! -f "$DB_CMD" ]; then
        return 0  # 不在开发者空间，跳过
    fi
    source "$DB_CMD" 2>/dev/null || return 0

    # 检查是否有活跃的 host 进程
    local active
    active=$(db_processes 2>/dev/null | python3 -c "
import json,sys
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('tunnelId') == '$TUNNEL_ID' and p.get('status') == 'running':
            print('yes')
            break
except: pass
" 2>/dev/null || echo "")

    if [ "$active" != "yes" ]; then
        log "🔄 隧道 host 进程未运行，重新启动..."
        db_host "$TUNNEL_ID" >/dev/null 2>&1 || true
        sleep 2
        log "✅ 隧道 host 已启动"
    fi
}

# ===== 主循环 =====
run_supervisor() {
    log "========== Supervisor 启动 =========="
    log "MCP_PORT=$MCP_PORT, PROXY_PORT=$PROXY_PORT, TUNNEL_ID=$TUNNEL_ID"

    local mcp_fail=0
    local proxy_fail=0

    while true; do
        # 1. 确保进程在跑
        start_mcp
        start_proxy

        # 2. 健康检查
        if health_check; then
            mcp_fail=0
            proxy_fail=0
        else
            # 区分是 MCP 还是 Proxy 挂了
            if ! is_listening "$MCP_PORT"; then
                mcp_fail=$((mcp_fail + 1))
                if [ $mcp_fail -ge $HEALTH_FAIL_THRESHOLD ]; then
                    restart_mcp
                    mcp_fail=0
                fi
            fi
            if ! is_listening "$PROXY_PORT"; then
                proxy_fail=$((proxy_fail + 1))
                if [ $proxy_fail -ge $HEALTH_FAIL_THRESHOLD ]; then
                    start_proxy
                    proxy_fail=0
                fi
            fi
        fi

        # 3. 维护隧道
        maintain_tunnel

        sleep "$CHECK_INTERVAL"
    done
}

# ===== 命令处理 =====
case "${1:-run}" in

    run)
        run_supervisor
        ;;

    start)
        # 检查 supervisor 是否已在运行
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "Supervisor 已在运行 (PID $(cat "$PID_FILE"))"
            exit 0
        fi
        nohup bash "$0" run > /dev/null 2>&1 &
        echo $! > "$PID_FILE"
        echo "✅ Supervisor 已后台启动 (PID $(cat "$PID_FILE"))"
        echo "   日志: $LOG_DIR/supervisor.log"
        ;;

    stop)
        echo "停止 Supervisor..."
        if [ -f "$PID_FILE" ]; then
            kill "$(cat "$PID_FILE")" 2>/dev/null || true
            rm -f "$PID_FILE"
        fi
        # 停止服务进程
        for f in mcp-server.pid proxy.pid; do
            if [ -f "$LOG_DIR/$f" ]; then
                kill "$(cat "$LOG_DIR/$f")" 2>/dev/null || true
                rm -f "$LOG_DIR/$f"
            fi
        done
        # 停止隧道
        if [ -f "$DB_CMD" ]; then
            source "$DB_CMD" 2>/dev/null || true
            PIDS=$(db_processes 2>/dev/null | python3 -c "
import json,sys
try:
    for p in json.load(sys.stdin):
        if p.get('tunnelId') == '$TUNNEL_ID':
            print(p['id'])
except: pass
" 2>/dev/null || true)
            for pid in $PIDS; do
                db_process_stop "$pid" 2>/dev/null || true
            done
        fi
        echo "✅ 已停止"
        ;;

    status)
        echo "=== Supervisor 状态 ==="
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "  Supervisor: ✅ 运行中 (PID $(cat "$PID_FILE"))"
        else
            echo "  Supervisor: ❌ 未运行"
        fi
        echo ""
        echo "=== 服务状态 ==="
        if is_listening "$MCP_PORT"; then
            echo "  MCP Server ($MCP_PORT): ✅ 监听中"
        else
            echo "  MCP Server ($MCP_PORT): ❌ 未监听"
        fi
        if is_listening "$PROXY_PORT"; then
            echo "  Proxy ($PROXY_PORT): ✅ 监听中"
        else
            echo "  Proxy ($PROXY_PORT): ❌ 未监听"
        fi
        echo ""
        echo "=== 健康检查 ==="
        if health_check; then
            echo "  健康检查: ✅ 正常"
        else
            echo "  健康检查: ❌ 异常"
        fi
        echo ""
        echo "=== 隧道状态 ==="
        if [ -f "$DB_CMD" ]; then
            source "$DB_CMD" 2>/dev/null || true
            URL=$(db_tunnel_url "$TUNNEL_ID" 2>/dev/null || echo "")
            if [ -n "$URL" ]; then
                echo "  公网 URL: $URL/mcp"
            else
                echo "  隧道: ❌ 未托管"
            fi
        else
            echo "  (非开发者空间，跳过)"
        fi
        echo ""
        echo "=== 最近日志 ==="
        tail -10 "$LOG_DIR/supervisor.log" 2>/dev/null || echo "  (无日志)"
        ;;

    *)
        echo "用法: $0 {start|stop|status|run}"
        echo ""
        echo "  start  - 后台启动守护进程"
        echo "  stop   - 停止守护和所有服务"
        echo "  status - 查看状态"
        echo "  run    - 前台运行（调试用）"
        exit 1
        ;;

esac
