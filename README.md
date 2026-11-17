# Browser Remote MCP Server

一个基于 MCP (Model Context Protocol) 协议的浏览器远程访问服务，通过 HTTPS 提供安全的浏览器自动化能力。

## 功能特性

- 🔒 **HTTPS 安全连接** — 使用自签名证书，自动生成和管理
- 🌐 **MCP 协议** — 基于 Model Context Protocol，支持 StreamableHTTP transport
- 🖥️ **Playwright 浏览器自动化** — 使用 Chromium headless 模式
- 🔑 **API Key 认证** — 通过 `x-api-key` 请求头进行身份验证
- 🔄 **CORS 支持** — 允许跨域访问

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
npx playwright install chromium
```

### 2. 编译

```bash
npm run build
```

### 3. 启动服务

```bash
npm start
```

服务将在 `https://localhost:9443` 上启动。

### 4. 健康检查

```bash
curl -k https://localhost:9443/healthz
```

## 配置

通过环境变量配置：

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `PORT` | `9443` | HTTPS 监听端口 |
| `MCP_API_KEY` | `browser-mcp-default-key` | API 认证密钥 |
| `CERT_DIR` | `./certs` | 证书存储目录 |

## MCP 协议使用

### 初始化会话

```bash
curl -k -X POST https://localhost:9443/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: browser-mcp-default-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "test", "version": "1.0.0" }
    }
  }'
```

### 列出工具

```bash
curl -k -X POST https://localhost:9443/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: browser-mcp-default-key" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

### 调用工具 — 打开网页

```bash
curl -k -X POST https://localhost:9443/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: browser-mcp-default-key" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "browser_navigate",
      "arguments": { "url": "https://www.huaweicloud.com" }
    }
  }'
```

## 项目结构

```
browser-remote-mcp/
├── src/
│   ├── index.ts            # 主入口，HTTPS 服务器
│   ├── mcp-server.ts       # MCP Server 定义和工具注册
│   ├── browser-manager.ts  # Playwright 浏览器管理
│   └── cert.ts             # 自签名证书生成
├── package.json
├── tsconfig.json
└── README.md
```

## 技术栈

- **Node.js** + **TypeScript** — 运行时和开发语言
- **@modelcontextprotocol/sdk** — MCP 协议 SDK
- **Playwright** — 浏览器自动化
- **Express** — HTTP 框架
- **selfsigned** — 自签名证书生成

## 部署到华为云

### 在华为云开发者空间中运行

本项目已在华为云 AI 开发者空间中验证通过。服务启动后可通过以下 URL 访问：

```
https://9443-<workspace-id>.workspace.developer.huaweicloud.com/mcp
```

### 系统依赖

Chromium 需要以下系统库（openEuler/CentOS）：

```bash
dnf install -y nss nspr atk at-spi2-atk cups-libs libdrm \
  libXcomposite libXdamage libXrandr mesa-libgbm pango \
  alsa-lib gtk3 libXtst
```

## License

MIT
