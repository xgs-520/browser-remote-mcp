import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { getOrCreateCertificate, Certificate } from './cert.js';
import { BrowserManager } from './browser-manager.js';
import { createMcpServer, createTransport } from './mcp-server.js';

const PORT = parseInt(process.env.PORT || '9443', 10);
const CERT_DIR = process.env.CERT_DIR || path.join(process.cwd(), 'certs');
const USE_HTTP = process.env.HTTP_MODE === 'true';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Accept',
    'Mcp-Session-Id', 'Last-Event-ID',
    'MCP-Protocol-Version', 'Mcp-Method', 'Mcp-Name',
  ],
  exposedHeaders: ['Mcp-Session-Id'],
}));

// Parse JSON body — pass req.body to transport.handleRequest as 3rd arg
app.use(express.json());

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'browser-remote-mcp', version: '1.0.0' });
});

const browserManager = new BrowserManager();

// MCP endpoint — stateless mode (MCP 2026-07-28)
// Key: pass req.body as 3rd arg to handleRequest (SDK requires this with body-parser)
app.post('/mcp', async (req, res) => {
  try {
    const transport = createTransport();
    const server = createMcpServer(browserManager);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP POST error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/mcp', async (req, res) => {
  try {
    const transport = createTransport();
    const server = createMcpServer(browserManager);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
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
    const server = createMcpServer(browserManager);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP DELETE error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'browser-remote-mcp',
    version: '1.0.0',
    description: 'Browser Remote Access MCP Server (no auth, MCP 2026-07-28)',
    endpoints: { health: '/healthz', mcp: '/mcp' },
    auth: 'none',
    protocolVersion: '2026-07-28',
  });
});

process.on('SIGINT', async () => {
  await browserManager.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await browserManager.close();
  process.exit(0);
});

async function main() {
  console.log(`Starting Browser Remote MCP Server...`);
  console.log(`Port: ${PORT}, Mode: ${USE_HTTP ? 'HTTP' : 'HTTPS'}, Auth: None`);

  if (USE_HTTP) {
    http.createServer(app).listen(PORT, () => {
      console.log(`✅ Running at http://localhost:${PORT}/mcp (MCP 2026-07-28 stateless)`);
    });
  } else {
    const cert: Certificate = getOrCreateCertificate(CERT_DIR);
    https.createServer({ cert: cert.cert, key: cert.key }, app).listen(PORT, () => {
      console.log(`✅ Running at https://localhost:${PORT}/mcp (MCP 2026-07-28 stateless)`);
    });
  }
}

main().catch((error) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
