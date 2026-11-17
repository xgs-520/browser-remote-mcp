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
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

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
