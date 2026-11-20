#!/bin/bash
#
# 一键启动 MCP 服务 + 认证代理 + 隧道（永久守护模式）
# 用法：./start-all.sh
#
# 改进：使用 supervisor.sh 守护进程，服务挂了自动重启
# 前提：在华为云开发者空间中运行
#

set -e
cd "$(dirname "$0")"

echo "=== 0. 检查 Playwright Chromium 内核 ==="
CHROMIUM_BIN=""
# 修复：glob 同时匹配 chromium-* 和 chromium_headless_shell-*
for dir in /root/.cache/ms-playwright/chromium-* /root/.cache/ms-playwright/chromium_headless_shell-*; do
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
	echo " ✅ Chromium 已安装: $CHROMIUM_BIN"
else
	echo " ⚠️ Chromium 未安装，开始安装..."
	# 安装系统依赖（openEuler）
	dnf install -y nss nspr atk at-spi2-atk cups-libs libdrm \
		libXcomposite libXdamage libXrandr mesa-libgbm pango \
		alsa-lib gtk3 libXtst 2>/dev/null || true
	# 安装 Chromium 内核
	npx playwright install chromium-headless-shell 2>&1 || {
		echo " ❌ Chromium 安装失败，浏览器工具将不可用"
		echo " 手动重试: npx playwright install chromium-headless-shell"
	}
	echo " ✅ Chromium 安装完成"
fi

echo ""
echo "=== 1. 检查编译产物 ==="
if [ ! -f dist/index.js ]; then
	echo " 编译项目..."
	npm run build
	echo " ✅ 编译完成"
else
	echo " ✅ dist/index.js 已存在"
fi

echo ""
echo "=== 2. 启动 Supervisor 守护进程 ==="
./supervisor.sh start

echo ""
echo "=== 3. 等待服务就绪 ==="
sleep 5

echo ""
echo "=== 4. 验证 ==="
./supervisor.sh status

echo ""
echo "=== 5. 设置 crontab 自启（每 2 分钟检查 supervisor 是否存活）==="
CRON_JOB="*/2 * * * * $(pwd)/supervisor.sh start >/dev/null 2>&1"
(crontab -l 2>/dev/null | grep -v "supervisor.sh start" ; echo "$CRON_JOB") | crontab -
echo " ✅ crontab 已设置：每 2 分钟检查 supervisor，没跑就拉起"

echo ""
echo "✅ 全部启动完成！"
echo "   管理命令："
echo "     ./supervisor.sh status  # 查看状态"
echo "     ./supervisor.sh stop    # 停止所有服务"
echo "     ./supervisor.sh start   # 重新启动"
