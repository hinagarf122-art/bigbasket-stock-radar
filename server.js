const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const locationHandler = require('./api/locations');
const stockHandler = require('./api/stock');
const licenseHandler = require('./api/license');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/manifest.json': ['manifest.json', 'application/manifest+json; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icon-512.png': ['icon-512.png', 'image/png'],
  '/nachte_milenge_hanumana.mp3': ['nachte_milenge_hanumana.mp3', 'audio/mpeg'],
  '/whatsapp_video_2026-09-26_at_11.33.59_am.mp4': ['whatsapp_video_2026-09-26_at_11.33.59_am.mp4', 'video/mp4'],
};

function responseAdapter(res) {
  const adapter = {
    status(code) { res.statusCode = code; return adapter; },
    setHeader(name, value) { res.setHeader(name, value); return adapter; },
    json(body) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
      return adapter;
    },
    end(body) { res.end(body); return adapter; },
  };
  return adapter;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Request body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/health' || pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: true, service: 'bigbasket-stock-radar' }));
  }

  if (pathname === '/api/locations') {
    const query = Object.fromEntries(requestUrl.searchParams.entries());
    return locationHandler({ method: req.method, query }, responseAdapter(res));
  }

  if (pathname === '/api/license') {
    let body;
    try { body = await readBody(req); } catch (error) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: error.message }));
    }
    return licenseHandler({ method: req.method, body }, responseAdapter(res));
  }

  if (pathname === '/api/stock') {
    let body;
    try { body = await readBody(req); } catch (error) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: error.message }));
    }
    return stockHandler({ method: req.method, body }, responseAdapter(res));
  }

  const file = files[pathname];
  if (!file || req.method !== 'GET') {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('Cache-Control', 'no-store');
  const filePath = path.join(ROOT, file[0]);
  const size = fs.statSync(filePath).size;
  res.setHeader('Content-Type', file[1]);
  res.setHeader('Accept-Ranges', 'bytes');
  const range = req.headers.range;
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]) - 1);
      const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
      if (start <= end && start < size) {
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', end - start + 1);
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
    }
  }
  res.setHeader('Content-Length', size);
  return fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(error => {
    if (res.headersSent) return res.end();
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error.message || 'Server error.' }));
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`BigBasket Stock Radar listening on ${PORT}`));
