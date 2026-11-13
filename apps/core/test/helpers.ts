import type { DecisionRequest } from '@nod/contract';
import type { Config } from '../src/config.js';
import { createPool, migrate, type Db } from '../src/db.js';
import { DecisionService, type Clock } from '../src/service.js';
import {
  AdapterRegistry,
  type DeliveryInput,
  type SourceAdapter,
  type SourceRef,
  type SourceState,
} from '../src/source.js';

export const TEST_DB =
  process.env.NOD_TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/nod_test';

/** Fresh schema per test file. (audit_log is append-only, so tables are dropped, not truncated.) */
export async function freshDb(): Promise<Db> {
  const db = createPool(TEST_DB);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  return db;
}

export class TestClock implements Clock {
  constructor(private t = new Date('2026-11-13T18:00:00Z')) {}
  now(): Date {
    return new Date(this.t);
  }
  advance(seconds: number): void {
    this.t = new Date(this.t.getTime() + seconds * 1000);
  }
}

/** A stand-in source: tests change its fingerprint, resolve it, or make it fail. */
export class FakeSource implements SourceAdapter {
  fingerprints = new Map<string, string>();
  resolved = new Set<string>();
  delivered: DeliveryInput[] = [];
  /** Number of upcoming deliver() calls that should throw. */
  failNext = 0;
  /** When set, fingerprint() throws (source outage). */
  down = false;
  private seen = new Set<string>();

  set(ref: string, fingerprint: string): void {
    this.fingerprints.set(ref, fingerprint);
  }

  fingerprint(source: SourceRef): Promise<SourceState | null> {
    if (this.down) return Promise.reject(new Error('source is down'));
    const fp = this.fingerprints.get(source.ref);
    if (fp === undefined) return Promise.resolve(null);
    return Promise.resolve({ fingerprint: fp, resolved: this.resolved.has(source.ref) });
  }

  deliver(input: DeliveryInput): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error('503 from source'));
    }
    // Like a real source honouring the key: applying the same key twice is a no-op.
    if (!this.seen.has(input.idempotencyKey)) {
      this.seen.add(input.idempotencyKey);
      this.delivered.push(input);
    }
    return Promise.resolve();
  }
}

export function testConfig(over: Partial<Config> = {}): Config {
  return {
    port: 0,
    databaseUrl: TEST_DB,
    deviceToken: 'device-token-0123456789',
    agentTokens: new Map([
      ['paperclip-token-0123456789', 'paperclip'],
      ['hermes-token-0123456789', 'hermes'],
    ]),
    deliveryMode: 'live',
    undoWindowSeconds: 120,
    undoWindowBySource: {},
    maxDeliveryAttempts: 3,
    retryBackoffSeconds: 30,
    reconcilerIntervalSeconds: 300,
    writerTickSeconds: 5,
    expiryTickSeconds: 30,
    ...over,
  };
}

export interface Harness {
  db: Db;
  clock: TestClock;
  source: FakeSource;
  service: DecisionService;
  config: Config;
}

export async function harness(over: Partial<Config> = {}, db?: Db): Promise<Harness> {
  const pool = db ?? (await freshDb());
  const clock = new TestClock();
  const source = new FakeSource();
  const config = testConfig(over);
  const adapters = new AdapterRegistry().register('paperclip', source);
  return {
    db: pool,
    clock,
    source,
    config,
    service: new DecisionService(pool, adapters, config, clock),
  };
}

export function request(over: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    source: { system: 'paperclip', ref: 'approval-1' },
    provenance: { kind: 'internal' },
    glance: { title: 'Ship the job-board fix?', question: 'Deploy the fix to production now?' },
    impact: 'Job seekers currently see duplicate listings; this removes them.',
    options: [
      { id: 'ship', label: 'Ship it', outcome: 'Fix goes live.', reversible: true, writes: true },
      { id: 'wait', label: 'Wait', outcome: 'Nothing changes.', reversible: true, writes: false },
    ],
    recommended: 'ship',
    fingerprint: 'rev-1',
    ttl_seconds: 600,
    ...over,
  };
}

export async function events(db: Db, id: string): Promise<string[]> {
  const { rows } = await db.query<{ event: string }>(
    'SELECT event FROM audit_log WHERE decision_id = $1 ORDER BY id',
    [id],
  );
  return rows.map((r) => r.event);
}
