import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { getOrCreateCertificate, Certificate } from './cert.js';
import { BrowserManager } from './browser-manager.js';
import { createMcpServer, createTransport } from './mcp-server.js';

const PORT = parseInt(process.env.PORT || '9443', 10);
const API_KEY = process.env.MCP_API_KEY || 'browser-mcp-default-key';
const CERT_DIR = process.env.CERT_DIR || path.join(process.cwd(), 'certs');

const app = express();

// CORS middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Mcp-Session-Id', 'Last-Event-ID'],
  exposedHeaders: ['Mcp-Session-Id'],
}));

// JSON body parser
app.use(express.json());

// API Key authentication middleware
app.use((req, res, next) => {
  // Skip auth for health check
  if (req.path === '/healthz') {
    return next();
  }
  const providedKey = req.headers['x-api-key'] as string;
  if (providedKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  }
  next();
});

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'browser-remote-mcp', version: '1.0.0' });
});

// MCP endpoint - handle MCP protocol over HTTPS
const browserManager = new BrowserManager();
const mcpServer = createMcpServer(browserManager);

app.post('/mcp', async (req, res) => {
  try {
    const transport = createTransport();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/mcp', async (req, res) => {
  try {
    const transport = createTransport();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP GET error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.delete('/mcp', async (req, res) => {
  try {
    const transport = createTransport();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP DELETE error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Root endpoint - service info
app.get('/', (req, res) => {
  res.json({
    service: 'browser-remote-mcp',
    version: '1.0.0',
    description: 'Browser Remote Access MCP Server',
    endpoints: {
      health: '/healthz',
      mcp: '/mcp',
    },
    tools: [
      'browser_navigate',
      'browser_screenshot',
      'browser_click',
      'browser_type',
      'browser_evaluate',
      'browser_get_content',
      'browser_get_html',
      'browser_close',
      'browser_list_tabs',
      'browser_wait_for',
    ],
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await browserManager.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  await browserManager.close();
  process.exit(0);
});

// Start HTTPS server
async function main() {
  console.log('Starting Browser Remote MCP Server...');
  console.log(`Port: ${PORT}`);
  console.log(`API Key: ${API_KEY.substring(0, 8)}...`);

  // Generate or load self-signed certificate
  const cert: Certificate = getOrCreateCertificate(CERT_DIR);
  console.log(`Certificate directory: ${CERT_DIR}`);

  const httpsServer = https.createServer(
    {
      cert: cert.cert,
      key: cert.key,
    },
    app
  );

  httpsServer.listen(PORT, () => {
    console.log(`\n✅ Browser Remote MCP Server is running!`);
    console.log(`   HTTPS endpoint: https://localhost:${PORT}/mcp`);
    console.log(`   Health check:   https://localhost:${PORT}/healthz`);
    console.log(`   API Key header: x-api-key: ${API_KEY.substring(0, 8)}...`);
    console.log(`\n   Available tools:`);
    console.log(`   - browser_navigate:  Open a URL`);
    console.log(`   - browser_screenshot: Capture page screenshot`);
    console.log(`   - browser_click:     Click an element`);
    console.log(`   - browser_type:      Type text into input`);
    console.log(`   - browser_evaluate:  Execute JavaScript`);
    console.log(`   - browser_get_content: Get page text`);
    console.log(`   - browser_get_html:   Get page HTML`);
    console.log(`   - browser_close:    Close browser`);
    console.log(`   - browser_list_tabs: List open tabs`);
    console.log(`   - browser_wait_for: Wait for element`);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
