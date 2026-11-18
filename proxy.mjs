// Lightweight reverse proxy: injects x-api-key header for tunnel access
// Tunnel → this proxy (port 9446) → sandbox MCP service (port 9443)
import https from 'node:https';
import http from 'node:http';

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '9446', 10);
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '9443', 10);
const API_KEY = process.env.MCP_API_KEY || 'changeme';

const server = http.createServer((req, res) => {
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
  console.log(`Injected API key: ${API_KEY.substring(0, 8)}...`);
});
