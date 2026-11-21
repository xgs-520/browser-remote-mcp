import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { getOrCreateCertificate, Certificate } from './cert.js';
import { BrowserManager } from './browser-manager.js';
import { createMcpServer, createTransport } from './mcp-server.js';

const PORT = parseInt(process.env.PORT || '9443', 10);
const CERT_DIR = process.env.CERT_DIR || path.join(process.cwd(), 'certs');
const USE_HTTP = process.env.HTTP_MODE === 'true';

const app = express();

// CORS disabled for security — MCP clients connect directly, no cross-origin needed
app.options('/mcp', (req, res) => {
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Last-Event-ID, MCP-Protocol-Version, Mcp-Method, Mcp-Name, X-Api-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.status(204).end();
});

// Parse JSON body — pass req.body to transport.handleRequest as 3rd arg
app.use(express.json());

// API Key authentication — rejects requests to /mcp without valid key
const API_KEY = process.env.MCP_API_KEY;
if (!API_KEY) {
  console.error('⚠️  WARNING: MCP_API_KEY not set, running WITHOUT authentication!');
}
app.use('/mcp', (req, res, next) => {
  if (!API_KEY) { return next(); } // no key configured = open mode (with warning)
  const key = req.headers['x-api-key'] as string;
  const urlKey = new URL(req.url, 'http://localhost').searchParams.get('key');
  if (key === API_KEY || urlKey === API_KEY) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
});

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
    description: 'Browser Remote Access MCP Server (API Key auth, MCP 2026-07-28)',
    endpoints: { health: '/healthz', mcp: '/mcp' },
    auth: API_KEY ? 'api-key' : 'none',
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
  console.log(`Port: ${PORT}, Mode: ${USE_HTTP ? 'HTTP' : 'HTTPS'}, Auth: ${API_KEY ? 'API-Key' : 'None(⚠️)'}`);

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
