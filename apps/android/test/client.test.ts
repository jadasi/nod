import { describe, expect, it } from 'vitest';
import { NodClient } from '@/api/client.js';
import { ApiError } from '@/api/types.js';

function mockFetch(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return (async (url: string, init?: RequestInit) => respond(url, init)) as typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('NodClient', () => {
  it('sends the bearer token to the device API', async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const c = new NodClient({
      baseUrl: 'https://nod.example/',
      token: 'tok',
      fetchImpl: mockFetch((url, init) => {
        seen = { url, init };
        return json({
          delivery_mode: 'live',
          undo_window_seconds: 120,
          reconciler_interval_seconds: 300,
        });
      }),
    });
    await c.status();
    expect(seen?.url).toBe('https://nod.example/v1/status');
    expect((seen?.init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('passes the inbox view and unwraps decisions', async () => {
    let path = '';
    const c = new NodClient({
      baseUrl: 'https://nod.example',
      token: 'tok',
      fetchImpl: mockFetch((url) => {
        path = new URL(url).pathname + new URL(url).search;
        return json({ decisions: [{ id: 'a' }] });
      }),
    });
    await c.decisions('inbox');
    expect(path).toBe('/v1/decisions?view=inbox');
  });

  it('identifies the android surface, maps payload fields and encodes the id', async () => {
    let body: Record<string, unknown> | undefined;
    let url = '';
    const c = new NodClient({
      baseUrl: 'https://nod.example',
      token: 'tok',
      fetchImpl: mockFetch((u, init) => {
        url = u;
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return json({ id: 'a' });
      }),
    });
    await c.answer('d 1', { optionId: 'merge', otherText: 'no' });
    expect(body).toMatchObject({ surface: 'android', option_id: 'merge', other_text: 'no' });
    expect(url).toBe('https://nod.example/v1/decisions/d%201/answer');
  });

  it('maps error bodies to ApiError', async () => {
    const c = new NodClient({
      baseUrl: 'https://nod.example',
      token: 'bad',
      fetchImpl: mockFetch(() =>
        json({ error: { code: 'unauthorized', message: 'Bad device token' } }, 401),
      ),
    });
    const err = await c.status().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('unauthorized');
    expect((err as ApiError).unauthorized).toBe(true);
  });

  it('keeps a default message for non-JSON errors', async () => {
    const c = new NodClient({
      baseUrl: 'https://nod.example',
      token: 'tok',
      fetchImpl: mockFetch(() => new Response('gone', { status: 404 })),
    });
    const err = await c.status().then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as ApiError).code).toBe('http');
    expect((err as ApiError).status).toBe(404);
  });

  it('openEvents parses the stream and closes cleanly', async () => {
    const frames = [
      'event: ready\ndata: {}\n\n',
      'event: decision\ndata: {"type":"decision","id":"a","status":"open"}\n\n',
    ].join('');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frames));
        controller.close();
      },
    });
    const events: unknown[] = [];
    const c = new NodClient({
      baseUrl: 'https://nod.example',
      token: 'tok',
      fetchImpl: mockFetch(
        () =>
          new Response(stream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }),
      ),
    });
    const close = c.openEvents((e) => {
      events.push(e);
    });
    await new Promise((r) => setTimeout(r, 20));
    close();
    expect(events).toEqual([{ type: 'ready' }, { type: 'decision', id: 'a', status: 'open' }]);
  });
});
