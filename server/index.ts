import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { brand } from '../src/branding/brand.config.ts';
import { createBackend } from './app.ts';

/*
 * Production server: serves the built app from dist/, the accounts API at
 * /api/auth/* and the signaling WebSocket at /ws, all on one port.
 *   npm run build && npm start        (PORT, TURN_URL, … — see README)
 * Browsers only allow camera and microphone on HTTPS (or localhost), so run
 * this behind a TLS-terminating proxy in production.
 */

const port = Number(process.env.PORT ?? 8080);
const root = resolve(process.env.STATIC_DIR ?? 'dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=()',
};

function fileFor(urlPath: string): string | null {
  let rel: string;
  try {
    rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  } catch {
    return null;
  }
  const full = join(root, rel);
  if (!full.startsWith(root)) return null; // path traversal
  try {
    return statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

const backend = createBackend({ databasePath: process.env.DATABASE_PATH ?? 'data/addcall.db' });

const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (await backend.handleApi(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, SECURITY_HEADERS).end();
    return;
  }
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
    res.end(JSON.stringify({ ok: true, name: brand.name, ...backend.stats() }));
    return;
  }
  // Unknown paths fall back to the app shell (client-side routing).
  const file = fileFor(path) ?? join(root, 'index.html');
  const ext = extname(file);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${join(root, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  });
  if (req.method === 'HEAD') return void res.end();
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
});

backend.attach(server);

server.listen(port, () => console.log(`${brand.name} listening on http://localhost:${port}`));

const shutdown = () => {
  backend.close();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
