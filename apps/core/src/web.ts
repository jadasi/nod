import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Hono } from 'hono';
import type { Variables } from './auth.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

/** apps/web/public, whether running from src/ (tests, dev) or dist/ (production). */
export function defaultWebDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../web/public');
}

/**
 * Serves the bare web inbox (static files, no build step). The files carry no data and no secrets;
 * every decision is fetched from `/v1/*`, which requires the device token.
 */
export function serveWeb(app: Hono<{ Variables: Variables }>, dir: string = defaultWebDir()): void {
  const root = resolve(dir);
  app.get('*', async (c) => {
    const path = c.req.path === '/' ? '/index.html' : c.req.path;
    const file = resolve(join(root, normalize(path)));
    const type = TYPES[extname(file)];
    if (!type || !file.startsWith(root + sep)) return c.notFound();
    try {
      const body = await readFile(file);
      return c.body(body, 200, {
        'content-type': type,
        // Revalidate every load so a deploy is picked up immediately.
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
        ...(extname(file) === '.html'
          ? {
              'content-security-policy':
                "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
            }
          : {}),
      });
    } catch {
      return c.notFound();
    }
  });
}
