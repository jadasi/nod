import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { agentAuth, deviceAuth, type Variables } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { NodError } from './errors.js';
import type { EventHub } from './events.js';
import { callTool, handleMcp } from './mcp.js';
import { HUMAN_SURFACES, type DecisionService, type Surface } from './service.js';

export interface AppDeps {
  config: Config;
  db: Db;
  service: DecisionService;
  hub: EventHub;
}

async function json(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new NodError('invalid_request', 'Body must be valid JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new NodError('invalid_request', 'Body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function humanSurface(v: unknown): Surface {
  const s = (v ?? 'web') as Surface;
  if (!HUMAN_SURFACES.includes(s)) {
    throw new NodError('invalid_request', `surface must be one of ${HUMAN_SURFACES.join(', ')}`);
  }
  return s;
}

export function createApp({ config, db, service, hub }: AppDeps): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();

  app.onError((err, c) => {
    if (err instanceof NodError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.httpStatus,
      );
    }
    console.error('unhandled error', err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'No such route' } }, 404));

  app.get('/healthz', async (c) => {
    try {
      await db.query('SELECT 1');
      return c.json({ ok: true, delivery_mode: config.deliveryMode });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  // ---- agents (scoped per-source tokens)
  const agent = new Hono<{ Variables: Variables }>();
  agent.use('*', agentAuth(config));
  agent.post('/decisions', async (c) => {
    const out = await service.submit(c.get('system'), await json(c));
    return c.json(out, out.deduplicated ? 200 : 201);
  });
  agent.get('/decisions/:id/await', async (c) => {
    const wait = Number(c.req.query('wait') ?? 20);
    return c.json(
      await callTool(
        service,
        hub,
        c.get('system'),
        'await_decision',
        {
          decision_id: c.req.param('id'),
          wait_seconds: Number.isFinite(wait) ? wait : 20,
        },
        c.req.raw.signal,
      ),
    );
  });
  agent.post('/decisions/:id/heartbeat', async (c) =>
    c.json(await service.heartbeat(c.get('system'), c.req.param('id'))),
  );
  agent.post('/decisions/:id/withdraw', async (c) => {
    const body = await json(c).catch(() => ({}) as Record<string, unknown>);
    await service.withdraw(
      c.get('system'),
      c.req.param('id'),
      typeof body.reason === 'string' ? body.reason : undefined,
    );
    return c.json({ ok: true });
  });
  agent.post('/updates', async (c) => {
    const body = await json(c);
    const kind = body.kind === 'progress' ? 'progress' : 'notify';
    return c.json(
      await callTool(
        service,
        hub,
        c.get('system'),
        kind === 'progress' ? 'report_progress' : 'notify',
        body,
      ),
      201,
    );
  });
  app.route('/v1/agent', agent);

  app.all('/mcp', agentAuth(config), (c) => handleMcp(service, hub, c.get('system'), c.req.raw));

  // ---- David's devices
  const dev = new Hono<{ Variables: Variables }>();
  dev.use('*', deviceAuth(config));
  dev.get('/status', (c) =>
    c.json({
      delivery_mode: config.deliveryMode,
      undo_window_seconds: config.undoWindowSeconds,
      reconciler_interval_seconds: config.reconcilerIntervalSeconds,
    }),
  );
  dev.get('/decisions', async (c) => {
    const v = c.req.query('view') ?? 'inbox';
    if (v !== 'inbox' && v !== 'repair' && v !== 'all') {
      throw new NodError('invalid_request', 'view must be inbox, repair or all');
    }
    return c.json({ decisions: await service.list(v) });
  });
  dev.get('/decisions/:id', async (c) => c.json(await service.get(c.req.param('id'))));
  dev.get('/decisions/:id/history', async (c) =>
    c.json({ history: await service.history(c.req.param('id')) }),
  );
  dev.post('/decisions/:id/answer', async (c) => {
    const b = await json(c);
    return c.json(
      await service.answer(c.req.param('id'), {
        option_id: typeof b.option_id === 'string' ? b.option_id : undefined,
        other_text: typeof b.other_text === 'string' ? b.other_text : undefined,
        surface: humanSurface(b.surface),
      }),
    );
  });
  const action = (name: 'undo' | 'reask' | 'refresh' | 'withdraw'): void => {
    dev.post(`/decisions/:id/${name}`, async (c) => {
      const b = await json(c).catch(() => ({}) as Record<string, unknown>);
      const surface = humanSurface(b.surface);
      const id = c.req.param('id');
      const out =
        name === 'undo'
          ? await service.undo(id, surface)
          : name === 'reask'
            ? await service.reask(id, surface)
            : name === 'refresh'
              ? await service.refresh(id, surface)
              : await service.withdrawByDavid(id, surface);
      return c.json(out);
    });
  };
  (['undo', 'reask', 'refresh', 'withdraw'] as const).forEach(action);
  dev.get('/updates', async (c) =>
    c.json({ updates: await service.listUpdates(Number(c.req.query('limit') ?? 50) || 50) }),
  );
  dev.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      let open = true;
      stream.onAbort(() => {
        open = false;
      });
      const unsub = hub.subscribe((e) => {
        void stream.writeSSE({ event: e.type, data: JSON.stringify(e) }).catch(() => undefined);
      });
      try {
        await stream.writeSSE({ event: 'ready', data: '{}' });
        while (open) {
          await stream.sleep(15_000);
          if (open) await stream.write(': keepalive\n\n');
        }
      } finally {
        unsub();
      }
    }),
  );
  app.route('/v1', dev);

  return app;
}
