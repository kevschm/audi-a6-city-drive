import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';

const ROOT = process.cwd();
const port = Number.parseInt(process.env.PORT || '8000', 10);
const host = process.env.HOST || '0.0.0.0';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Allow': 'GET, HEAD' }).end();
      return;
    }

    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
    const rel = relative(ROOT, path);
    if (rel.startsWith('..') || isAbsolute(rel) || rel.split(/[\\/]/).some(part => part.startsWith('.'))) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': mime.get(extname(path)) || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
  }
}).listen(port, host, () => {
  console.log(`Audi A6 City Drive running at http://localhost:${server.address().port}`);
});
