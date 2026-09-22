/**
 * Local preview server.
 *
 * It serves the repository root at / — the same shape the deployed site has,
 * since every path in the HTML is root-relative — and it sends the SAME
 * Content-Security-Policy that netlify.toml sends in production. That second
 * part is the point: without the header, an inline style or an unhashed
 * inline script works locally and is silently dropped on the deploy. With it,
 * the preview cannot disagree with production.
 *
 * Node's standard library only. Nothing to install.
 *
 *   node tools/preview.mjs [port]      →  http://localhost:8080
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const PORT = Number(process.argv[2]) || 8080;

/** Kept in step with netlify.toml by hand: the deploy config cannot import
 *  from here, so the policy exists twice on purpose. Change one, change both. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'sha256-tuKyZn/3ycw/MNMDii/kvSPrelo6SCsJSecqb1n2neg='",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Paths that exist in the repository but are never deployed. Serving them
 *  here would make the preview a poor model of production. */
const HIDDEN = ['tools', 'dist', '.shots', '.git', 'node_modules', '.netlify'];

async function resolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = normalize(decoded).replace(/^[\\/]+/, '');

  // No escaping the project, and nothing from a tools-only directory.
  const first = clean.split(/[\\/]/)[0];
  if (clean.startsWith('..') || HIDDEN.includes(first)) return null;

  const target = join(ROOT, clean);
  if (!target.startsWith(ROOT + sep) && target !== ROOT) return null;

  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      const index = join(target, 'index.html');
      await stat(index);
      return index;
    }
    return target;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const file = await resolve(req.url || '/');

  const headers = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
  };

  if (!file) {
    // The same 404 page Netlify serves from the publish root.
    try {
      const body = await readFile(join(ROOT, '404.html'));
      res.writeHead(404, { ...headers, 'Content-Type': TYPES['.html'] });
      res.end(body);
    } catch {
      res.writeHead(404, { ...headers, 'Content-Type': TYPES['.txt'] });
      res.end('404');
    }
    return;
  }

  const body = await readFile(file);
  res.writeHead(200, {
    ...headers,
    'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
  });
  res.end(body);
});

server.listen(PORT, () => {
  console.log(`RUŌOD preview  →  http://localhost:${PORT}`);
  console.log('Production CSP is being sent, exactly as netlify.toml sends it.');
});
