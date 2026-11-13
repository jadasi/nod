import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { EventHub } from '../src/events.js';
import { harness, TEST_DB, type Harness } from './helpers.js';

let h: Harness;
let hub: EventHub;
let base: string;
let server: ReturnType<typeof serve>;

beforeAll(async () => {
  h = await harness();
  hub = new EventHub(TEST_DB);
  await hub.start();
  const app = createApp({ config: h.config, db: h.db, service: h.service, hub });
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info: AddressInfo) => {
      base = `http://127.0.0.1:${info.port}`;
      resolve();
    });
  });
});
afterAll(async () => {
  server.close();
  await hub.stop();
  await h.db.end();
});

describe('web inbox hosting', () => {
  it('serves the app shell and its assets without a token', async () => {
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(await page.text()).toContain('<title>Nod</title>');
    for (const [path, type] of [
      ['/app.js', 'javascript'],
      ['/lib.js', 'javascript'],
      ['/style.css', 'text/css'],
      ['/sw.js', 'javascript'],
      ['/manifest.webmanifest', 'manifest+json'],
    ] as const) {
      const res = await fetch(`${base}${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type')).toContain(type);
    }
  });

  it('keeps all decision data behind the device token', async () => {
    expect((await fetch(`${base}/v1/decisions`)).status).toBe(401);
    expect((await fetch(`${base}/v1/events`)).status).toBe(401);
  });

  it('does not serve files outside the web directory', async () => {
    for (const path of ['/../src/web.ts', '/%2e%2e/src/web.ts', '/package.json', '/nope.html']) {
      const res = await fetch(`${base}${path}`);
      expect(res.status, path).toBe(404);
    }
  });

  it('still returns JSON errors for unknown API paths', async () => {
    const res = await fetch(`${base}/v1/nope`);
    expect([401, 404]).toContain(res.status);
  });
});
