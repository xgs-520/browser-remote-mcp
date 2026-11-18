// Lightweight reverse proxy: injects x-api-key header for tunnel access
// Tunnel → this proxy (port 9446) → sandbox MCP service (port 9443)
// Also serves /shots/* as static files for screenshot access
import https from 'node:https';
import http from 'node:http';
import { readFileSync, existsSync } from 'fs';
import { join, extname, normalize } from 'path';

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '9446', 10);
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '9443', 10);
const API_KEY = process.env.MCP_API_KEY || 'changeme';
const SHOTS_DIR = join(process.cwd(), 'shots');

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // Serve /shots/* as static files
  if (req.url?.startsWith('/shots/')) {
    const reqPath = normalize(decodeURIComponent(req.url));
    const filePath = join(process.cwd(), reqPath);

    // Prevent path traversal
    if (!filePath.startsWith(SHOTS_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && existsSync(filePath) && !filePath.endsWith('/')) {
      try {
        const data = readFileSync(filePath);
        const mime = MIME[extname(filePath)] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': data.length,
          'Cache-Control': 'public, max-age=3600',
        });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(data);
        }
        console.log(`[${new Date().toISOString()}] served: ${req.url} (${data.length} bytes)`);
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal error');
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  // Build headers for backend request
  const headers = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (key !== 'host' && key !== 'x-api-key') {
      headers[key] = val;
    }
  }
  // Inject the API key
  headers['x-api-key'] = API_KEY;
  headers['host'] = `localhost:${BACKEND_PORT}`;

  // Collect request body
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    // Log incoming MCP requests
    if (body.length > 0) {
      try {
        const parsed = JSON.parse(body.toString());
        if (parsed.method === 'tools/call') {
          console.log(`[${new Date().toISOString()}] tools/call: ${parsed.params?.name} args=${JSON.stringify(parsed.params?.arguments)}`);
        }
      } catch {}
    }

    const proxyReq = https.request(
      {
        hostname: 'localhost',
        port: BACKEND_PORT,
        path: req.url,
        method: req.method,
        headers,
        rejectUnauthorized: false,
      },
      (proxyRes) => {
        // Log response status
        console.log(`[${new Date().toISOString()}] backend responded: ${proxyRes.statusCode}`);

        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    // 30s timeout — if backend doesn't respond, return 504
    proxyReq.setTimeout(30000, () => {
      console.error(`[${new Date().toISOString()}] backend timeout (30s)`);
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Gateway timeout', message: 'Backend did not respond within 30s' }));
      }
      proxyReq.destroy();
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad gateway', detail: err.message }));
      }
    });

    if (body.length > 0) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`Auth-injecting proxy running on port ${PROXY_PORT}`);
  console.log(`Forwarding to: https://localhost:${BACKEND_PORT}`);
  console.log(`Shots dir: ${SHOTS_DIR}`);
  console.log(`Injected API key: ${API_KEY.substring(0, 8)}...`);
});
