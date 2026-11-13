import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { EventHub } from '../src/events.js';
import { harness, request, TEST_DB, type Harness } from './helpers.js';

let h: Harness;
let hub: EventHub;
let base: string;
let server: ReturnType<typeof serve>;

const DEVICE = { authorization: 'Bearer device-token-0123456789' };
const AGENT = { authorization: 'Bearer paperclip-token-0123456789' };
const jsonHeaders = (extra: Record<string, string>) => ({
  'content-type': 'application/json',
  ...extra,
});

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

describe('auth', () => {
  it('serves health without a token', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(await res.json()).toEqual({ ok: true, delivery_mode: 'live' });
  });

  it('rejects missing and wrong tokens', async () => {
    expect((await fetch(`${base}/v1/decisions`)).status).toBe(401);
    expect(
      (await fetch(`${base}/v1/decisions`, { headers: { authorization: 'Bearer nope' } })).status,
    ).toBe(401);
    expect(
      (await fetch(`${base}/v1/agent/decisions`, { method: 'POST', headers: jsonHeaders({}) }))
        .status,
    ).toBe(401);
  });

  it('keeps device and agent tokens apart', async () => {
    expect((await fetch(`${base}/v1/decisions`, { headers: AGENT })).status).toBe(401);
    const res = await fetch(`${base}/v1/agent/decisions`, {
      method: 'POST',
      headers: jsonHeaders(DEVICE),
      body: JSON.stringify(request()),
    });
    expect(res.status).toBe(401);
  });

  it('scopes an agent token to its own source', async () => {
    const res = await fetch(`${base}/v1/agent/decisions`, {
      method: 'POST',
      headers: jsonHeaders({ authorization: 'Bearer hermes-token-0123456789' }),
      body: JSON.stringify(request()),
    });
    expect(res.status).toBe(403);
  });
});

describe('REST loop and SSE', () => {
  it('names failing fields in a 400', async () => {
    const res = await fetch(`${base}/v1/agent/decisions`, {
      method: 'POST',
      headers: jsonHeaders(AGENT),
      body: JSON.stringify(request({ glance: { title: 't', question: 'q'.repeat(130) } })),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { details: string[] } };
    expect(body.error.details.join()).toContain('/glance/question');
  });

  it('streams changes to clients over SSE and runs the loop end to end', async () => {
    h.source.set('approval-1', 'rev-1');
    const ctrl = new AbortController();
    const sse = await fetch(`${base}/v1/events`, { headers: DEVICE, signal: ctrl.signal });
    expect(sse.headers.get('content-type')).toContain('text/event-stream');
    const reader = sse.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const until = async (needle: string): Promise<void> => {
      while (!buf.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`stream ended before ${needle}`);
        buf += dec.decode(value);
      }
    };
    await until('event: ready');

    const created = await fetch(`${base}/v1/agent/decisions`, {
      method: 'POST',
      headers: jsonHeaders(AGENT),
      body: JSON.stringify(request({ idempotency_key: 'http-1' })),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    await until(`"id":"${id}","status":"open"`);

    const inbox = (await (await fetch(`${base}/v1/decisions`, { headers: DEVICE })).json()) as {
      decisions: { id: string }[];
    };
    expect(inbox.decisions.map((d) => d.id)).toContain(id);

    const ans = await fetch(`${base}/v1/decisions/${id}/answer`, {
      method: 'POST',
      headers: jsonHeaders(DEVICE),
      body: JSON.stringify({ option_id: 'ship', surface: 'android' }),
    });
    expect(ans.status).toBe(200);
    await until(`"status":"answered"`);

    // A long-polling agent wakes as soon as delivery happens.
    const waiting = fetch(`${base}/v1/agent/decisions/${id}/await?wait=20`, { headers: AGENT });
    h.clock.advance(121);
    await h.service.deliverDue();
    const res = (await (await waiting).json()) as {
      state: string;
      answer: { option_id: string; fingerprint: string };
    };
    expect(res.state).toBe('delivered');
    expect(res.answer).toMatchObject({ option_id: 'ship', fingerprint: 'rev-1' });
    await until(`"status":"delivered"`);
    ctrl.abort();

    const hist = (await (
      await fetch(`${base}/v1/decisions/${id}/history`, { headers: DEVICE })
    ).json()) as {
      history: { event: string }[];
    };
    expect(hist.history.map((e) => e.event)).toEqual(['created', 'answered', 'delivered']);
  });

  it('rejects device answers claiming an automatic surface', async () => {
    const created = await h.service.submit(
      'paperclip',
      request({ source: { system: 'paperclip', ref: 'x-9' } }),
    );
    const res = await fetch(`${base}/v1/decisions/${created.id}/answer`, {
      method: 'POST',
      headers: jsonHeaders(DEVICE),
      body: JSON.stringify({ option_id: 'ship', surface: 'default' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('MCP', () => {
  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'test-agent', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  }
  const call = async (c: Client, name: string, args: Record<string, unknown>) => {
    const res = await c.callTool({ name, arguments: args });
    const text = (res.content as { text: string }[])[0]?.text ?? '';
    return {
      isError: res.isError === true,
      text,
      json: res.isError ? null : (JSON.parse(text) as Record<string, unknown>),
    };
  };

  it('requires an agent token', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: jsonHeaders({}),
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('exposes the four tools plus heartbeat and withdraw', async () => {
    const c = await connect('paperclip-token-0123456789');
    const names = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'await_decision',
      'heartbeat_decision',
      'notify',
      'report_progress',
      'request_decision',
      'withdraw_decision',
    ]);
    await c.close();
  });

  it('runs request_decision, await_decision, notify and report_progress', async () => {
    const c = await connect('paperclip-token-0123456789');
    h.source.set('mcp-1', 'rev-1');
    const made = await call(
      c,
      'request_decision',
      request({ source: { system: 'paperclip', ref: 'mcp-1' } }) as never,
    );
    expect(made.json).toMatchObject({ status: 'open', deduplicated: false });
    const id = made.json!.id as string;

    const pending = await call(c, 'await_decision', { decision_id: id, wait_seconds: 0 });
    expect(pending.json).toMatchObject({ state: 'waiting' });

    await h.service.answer(id, { option_id: 'wait', surface: 'glasses' });
    h.clock.advance(121);
    const waiting = call(c, 'await_decision', { decision_id: id, wait_seconds: 10 });
    await h.service.deliverDue();
    expect((await waiting).json).toMatchObject({
      state: 'delivered',
      answer: { option_id: 'wait', fingerprint: 'rev-1' },
    });

    expect((await call(c, 'notify', { title: 'Heads up', level: 'warn' })).json).toHaveProperty(
      'id',
    );
    expect((await call(c, 'report_progress', { title: '2 of 4 done' })).json).toHaveProperty('id');
    await c.close();
  });

  it('reports validation failures as tool errors naming the field', async () => {
    const c = await connect('paperclip-token-0123456789');
    const bad = await call(
      c,
      'request_decision',
      request({ glance: { title: 't', question: 'q'.repeat(130) } }) as never,
    );
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('/glance/question');
    await c.close();
  });

  it("keeps one source from touching another source's decisions", async () => {
    const owner = await connect('paperclip-token-0123456789');
    h.source.set('mcp-2', 'rev-1');
    const made = await call(
      owner,
      'request_decision',
      request({ source: { system: 'paperclip', ref: 'mcp-2' } }) as never,
    );
    const other = await connect('hermes-token-0123456789');
    expect((await call(other, 'withdraw_decision', { decision_id: made.json!.id })).isError).toBe(
      true,
    );
    expect((await call(owner, 'withdraw_decision', { decision_id: made.json!.id })).isError).toBe(
      false,
    );
    await owner.close();
    await other.close();
  });
});
