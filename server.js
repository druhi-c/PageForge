// Local-only static file server. It accepts no uploads and binds only to loopback.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const host = '127.0.0.1';
const port = Number(process.env.PDF_STUDIO_PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.bcmap': 'application/octet-stream', '.ttf': 'font/ttf', '.otf': 'font/otf' };

http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname); }
  catch { response.writeHead(400); response.end(); return; }
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  fs.stat(target, (statError, info) => {
    if (statError || !info.isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, {
      'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'",
    });
    if (request.method === 'HEAD') { response.end(); return; }
    fs.createReadStream(target).pipe(response);
  });
}).listen(port, host, () => console.log(`PageForge is ready at http://${host}:${port}/ (stop with Ctrl+C)`));
