/* Local server that behaves like the Vercel deployment: static files with the
   same cache headers as vercel.json, plus the real /api/ai serverless function.
   Usage: npm run dev   (PORT=3000 by default; OPENAI_API_KEY etc. are read from the environment) */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const aiHandler = require('../api/ai.js');
const vercelHeaders = require('./vercel-headers.js');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function apiResponse(res) {
  return Object.assign(res, {
    status(code) { res.statusCode = code; return res; },
    json(data) { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); return res; }
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  vercelHeaders.apply(res, url.pathname); // same CSP / security / cache headers as vercel.json
  if (url.pathname === '/api/ai') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      req.body = body ? (() => { try { return JSON.parse(body); } catch (e) { return body; } })() : {};
      Promise.resolve(aiHandler(req, apiResponse(res))).catch(err => { res.statusCode = 500; res.end(String(err)); });
    });
    return;
  }
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(root, '.' + rel);
  if (!file.startsWith(root + path.sep) || rel.split('/').some(seg => seg.startsWith('.') || seg === 'node_modules')) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    // Compress text like Vercel does (brotli, else gzip), so local measurements match production.
    const accept = String(req.headers['accept-encoding'] || '');
    if (/^(text\/|application\/(json|manifest))/.test(type) && data.length > 1024 && /(br|gzip)/.test(accept)) {
      const br = /br/.test(accept);
      res.setHeader('Content-Encoding', br ? 'br' : 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.end(br ? zlib.brotliCompressSync(data) : zlib.gzipSync(data));
      return;
    }
    res.end(data);
  });
}).listen(port, () => console.log('Wordzone → http://localhost:' + port));
