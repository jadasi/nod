import pg from 'pg';
import type { Db, Queryable } from './db.js';

export const CHANNEL = 'nod_events';

export type NodEvent =
  { type: 'decision'; id: string; status: string } | { type: 'update'; id: number };

/** Publishes inside the caller's transaction, so listeners hear it only after commit. */
export async function emit(q: Queryable, event: NodEvent): Promise<void> {
  await q.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(event)]);
}

type Listener = (event: NodEvent) => void;

/** One Postgres LISTEN connection fanned out to SSE streams and long-polling agents. */
export class EventHub {
  private readonly listeners = new Set<Listener>();
  private client: pg.Client | null = null;
  private stopped = false;
  private retry: NodeJS.Timeout | null = null;

  constructor(private readonly databaseUrl: string) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    const client = new pg.Client({ connectionString: this.databaseUrl });
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      let event: NodEvent;
      try {
        event = JSON.parse(msg.payload) as NodEvent;
      } catch {
        return;
      }
      for (const l of this.listeners) l(event);
    });
    const lost = (): void => {
      if (this.client !== client) return;
      this.client = null;
      client.removeAllListeners();
      client.end().catch(() => undefined);
      if (!this.stopped) this.retry = setTimeout(() => void this.reconnect(), 1000);
    };
    client.on('error', lost);
    client.on('end', lost);
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    this.client = client;
  }

  private async reconnect(): Promise<void> {
    try {
      await this.connect();
      // Events may have been missed while disconnected; tell listeners to resync.
      for (const l of this.listeners) l({ type: 'decision', id: '*', status: 'resync' });
    } catch {
      if (!this.stopped) this.retry = setTimeout(() => void this.reconnect(), 2000);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves on the next event matching `pred`, or after `timeoutMs` (resolves false). */
  waitFor(
    pred: (e: NodEvent) => boolean,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (value: boolean): void => {
        clearTimeout(timer);
        unsub();
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      };
      const onAbort = (): void => done(false);
      const unsub = this.subscribe((e) => {
        if (pred(e)) done(true);
      });
      const timer = setTimeout(() => done(false), timeoutMs);
      signal?.addEventListener('abort', onAbort);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    const c = this.client;
    this.client = null;
    c?.removeAllListeners();
    await c?.end().catch(() => undefined);
    this.listeners.clear();
  }
}

export type { Db };
