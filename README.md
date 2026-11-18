# Browser Remote MCP Server

一个基于 MCP (Model Context Protocol) 协议的浏览器远程访问服务，通过 HTTP/HTTPS 提供浏览器自动化能力。

**无认证模式** | **MCP 协议 2026-07-28** | **Streamable HTTP transport**

## 功能特性

- 🌐 **MCP 协议 2026-07-28** — Streamable HTTP transport，stateless 模式
- 🖥️ **Playwright 浏览器自动化** — Chromium headless 模式，10 个工具
- 🚫 **无认证** — 无需 API Key，直接连接即可使用
- 🔧 **HTTP/HTTPS 双模式** — 支持 `HTTP_MODE` 环境变量切换
- 🔄 **CORS 支持** — 允许跨域访问
- 📦 **postinstall 自动配置** — `npm install` 自动 patch SDK + 安装浏览器内核

## MCP 工具列表

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `browser_navigate` | 打开指定 URL | `url`: string |
| `browser_screenshot` | 截取页面截图（base64 PNG） | `fullPage`: boolean (可选) |
| `browser_click` | 点击页面元素 | `selector`: string (CSS) |
| `browser_type` | 在输入框输入文本 | `selector`: string, `text`: string |
| `browser_evaluate` | 执行 JavaScript 并返回结果 | `script`: string |
| `browser_get_content` | 获取页面文本内容 | 无 |
| `browser_get_html` | 获取页面完整 HTML | 无 |
| `browser_close` | 关闭浏览器 | 无 |
| `browser_list_tabs` | 列出所有标签页 | 无 |
| `browser_wait_for` | 等待元素出现 | `selector`: string, `timeout`: number (可选) |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

`postinstall` 脚本会自动：
- Patch SDK，添加 `2026-07-28` 协议版本支持
- 下载 Chromium headless shell 内核

### 2. 安装系统依赖

Chromium 需要系统底层库，根据你的系统选择：

**openEuler / CentOS / RHEL:**
```bash
dnf install -y nss nspr atk at-spi2-atk cups-libs libdrm \
  libXcomposite libXdamage libXrandr mesa-libgbm pango \
  alsa-lib gtk3 libXtst
```

**Ubuntu / Debian:**
```bash
apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxcomposite1 libxdamage1 libxrandr2 \
  libgbm1 libpango-1.0-0 libasound2 libgtk-3-0
```

### 3. 编译 & 启动

```bash
npm run build
npm start                  # HTTPS 模式 (默认, 端口 9443)
HTTP_MODE=true npm start   # HTTP 模式 (用于反向代理/隧道)
```

### 4. 验证

```bash
# 健康检查
curl http://localhost:9443/healthz

# MCP initialize
curl -X POST http://localhost:9443/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

## 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `PORT` | `9443` | 监听端口 |
| `HTTP_MODE` | `false` | 设为 `true` 时用 HTTP 代替 HTTPS（配合反向代理/隧道使用） |
| `CERT_DIR` | `./certs` | 证书存储目录（仅 HTTPS 模式） |

## MCP 客户端连接

在支持 MCP 的客户端中，直接使用 URL 连接，无需认证：

```json
{
  "mcpServers": {
    "browser-remote-mcp": {
      "url": "https://your-server.com/mcp"
    }
  }
}
```

## 项目结构

```
browser-remote-mcp/
├── src/
│   ├── index.ts            # 主入口，HTTP/HTTPS 服务器（无认证）
│   ├── mcp-server.ts       # MCP Server 定义和工具注册（2026-07-28 stateless）
│   ├── browser-manager.ts  # Playwright 浏览器管理
│   └── cert.ts             # 自签名证书生成
├── scripts/
│   └── postinstall.sh      # 自动 patch SDK + 安装浏览器内核
├── package.json
├── tsconfig.json
└── README.md
```

## 技术栈

- **Node.js** + **TypeScript**
- **@modelcontextprotocol/sdk** `^1.32.2` — MCP 协议 SDK（postinstall 自动 patch 支持 2026-07-28）
- **Playwright** — 浏览器自动化（chromium-headless-shell）
- **Express** — HTTP 框架

## 关于 SDK 补丁

SDK 1.32.2 内置的协议版本列表最高只到 `2025-11-25`。当客户端请求 `2026-07-28` 时会返回 400 错误。

`scripts/postinstall.sh` 会在 `npm install` 后自动修改 `node_modules/@modelcontextprotocol/sdk/dist/` 中的 `types.js`，将 `2026-07-28` 加入 `SUPPORTED_PROTOCOL_VERSIONS` 列表。

如果你手动重新安装 SDK（如 `npm install @modelcontextprotocol/sdk`），需要重新运行：

```bash
bash scripts/postinstall.sh
```

## License

MIT
