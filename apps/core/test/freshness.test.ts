import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NodError } from '../src/errors.js';
import { events, harness, request, type Harness } from './helpers.js';

let h: Harness;
let n = 0;
beforeEach(async () => {
  if (h) await h.db.end();
  h = await harness();
  n = 0;
});
afterAll(() => h?.db.end());

async function open(over: Parameters<typeof request>[0] = {}, ref = `ref-${++n}`) {
  h.source.set(ref, 'rev-1');
  const { id, status } = await h.service.submit(
    'paperclip',
    request({ source: { system: 'paperclip', ref }, ...over }),
  );
  return { id, ref, status };
}

const code = async (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'ok',
    (e: unknown) => (e instanceof NodError ? e.code : 'other'),
  );

describe('source-freshness: revalidate before delivery', () => {
  it('does not deliver when the source changed during the undo window', async () => {
    const { id, ref } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'android' });
    h.clock.advance(60);
    h.source.set(ref, 'rev-2'); // someone pushed a new commit
    h.clock.advance(61);
    await h.service.deliverDue();
    const view = await h.service.get(id);
    expect(h.source.delivered).toHaveLength(0);
    expect(view.status).toBe('stale');
    expect(view.status_reason).toBe('Changed since you looked');
    expect((await h.service.awaitResult('paperclip', id)).state).toBe('stale');
    expect(await events(h.db, id)).toEqual(['created', 'answered', 'rejected_stale']);
    expect((await h.service.list('repair')).map((d) => d.id)).toContain(id);
  });

  it('rejects an answer when the source changed before David tapped', async () => {
    const { id, ref } = await open();
    h.source.set(ref, 'rev-2');
    expect(await code(h.service.answer(id, { option_id: 'ship', surface: 'android' }))).toBe(
      'stale',
    );
    expect((await h.service.get(id)).status).toBe('stale');
    const { rows } = await h.db.query('SELECT 1 FROM answers WHERE decision_id = $1', [id]);
    expect(rows).toHaveLength(0);
  });

  it('delivers when the fingerprint matches at both checks', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'android' });
    h.clock.advance(121);
    await h.service.deliverDue();
    expect(h.source.delivered).toHaveLength(1);
    expect(h.source.delivered[0]?.fingerprint).toBe('rev-1');
  });

  it('closes instead of delivering when the source was resolved during the window', async () => {
    const { id, ref } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'android' });
    h.source.resolved.add(ref);
    h.clock.advance(121);
    await h.service.deliverDue();
    expect(h.source.delivered).toHaveLength(0);
    expect((await h.service.get(id)).status).toBe('resolved_outside');
  });

  it('lets David re-ask, which tells the agent to re-submit', async () => {
    const { id, ref } = await open();
    h.source.set(ref, 'rev-2');
    await code(h.service.answer(id, { option_id: 'ship', surface: 'web' }));
    await h.service.reask(id, 'web');
    const res = await h.service.awaitResult('paperclip', id);
    expect(res.state).toBe('reask');
    // The agent re-submits with the fresh fingerprint and a fresh card appears.
    const fresh = await h.service.submit(
      'paperclip',
      request({ source: { system: 'paperclip', ref }, fingerprint: 'rev-2' }),
    );
    expect(fresh.status).toBe('open');
  });

  it('Force refresh reopens a stale card whose source went back', async () => {
    const { id, ref } = await open();
    h.source.set(ref, 'rev-2');
    await code(h.service.answer(id, { option_id: 'ship', surface: 'web' }));
    h.source.set(ref, 'rev-1');
    expect((await h.service.refresh(id, 'web')).status).toBe('open');
  });
});

describe('source-freshness: resource locks', () => {
  it('queues a second request on the same resource and surfaces it after the first closes', async () => {
    const a = await open({ resources: ['env:staging'] });
    const b = await open({ resources: ['env:staging'] });
    expect(a.status).toBe('open');
    expect(b.status).toBe('queued');
    const queued = await h.service.get(b.id);
    expect(queued.waiting_on).toBe(a.id);
    expect((await h.service.list('inbox')).map((d) => d.id)).toEqual([a.id]);
    expect((await h.service.list('repair')).map((d) => d.id)).toContain(b.id);
    expect(await code(h.service.answer(b.id, { option_id: 'wait', surface: 'web' }))).toBe(
      'conflict',
    );

    await h.service.answer(a.id, { option_id: 'wait', surface: 'web' });
    expect((await h.service.get(b.id)).status).toBe('queued'); // still held until A is delivered
    h.clock.advance(121);
    await h.service.deliverDue();
    const promoted = await h.service.get(b.id);
    expect(promoted.status).toBe('open');
    expect(promoted.waiting_on).toBeNull();
    expect(await events(h.db, b.id)).toEqual(['created', 'queued', 'promoted']);
  });

  it('promotes the next queued request when the holder is withdrawn or expires', async () => {
    const a = await open({ resources: ['branch:nod/main'], ttl_seconds: 60 });
    const b = await open({ resources: ['branch:nod/main'] });
    h.clock.advance(61);
    await h.service.expireDue();
    expect((await h.service.get(a.id)).status).toBe('expired');
    expect((await h.service.get(b.id)).status).toBe('open');
  });

  it('chains several waiters in order and keeps unrelated resources independent', async () => {
    const a = await open({ resources: ['env:x'] });
    const b = await open({ resources: ['env:x'] });
    const c = await open({ resources: ['env:x'] });
    const other = await open({ resources: ['env:y'] });
    expect(other.status).toBe('open');
    await h.service.withdraw('paperclip', a.id);
    expect((await h.service.get(b.id)).status).toBe('open');
    expect((await h.service.get(c.id)).status).toBe('queued');
    expect((await h.service.get(c.id)).waiting_on).toBe(b.id);
    await h.service.withdraw('paperclip', b.id);
    expect((await h.service.get(c.id)).status).toBe('open');
  });

  it('does not let concurrent submissions both take the same resource', async () => {
    const refs = ['r1', 'r2', 'r3', 'r4'];
    refs.forEach((r) => h.source.set(r, 'rev-1'));
    const results = await Promise.all(
      refs.map((ref) =>
        h.service.submit(
          'paperclip',
          request({ source: { system: 'paperclip', ref }, resources: ['env:race'] }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'open')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'queued')).toHaveLength(3);
  });
});

describe('source-freshness: reconciliation', () => {
  it('closes a card the source shows as already resolved ("resolved outside Nod")', async () => {
    const { id, ref } = await open();
    h.source.resolved.add(ref);
    const out = await h.service.reconcile();
    expect(out.closed).toBe(1);
    const view = await h.service.get(id);
    expect(view.status).toBe('resolved_outside');
    expect(view.status_reason).toBe('Resolved outside Nod');
    expect((await h.service.list('inbox')).map((d) => d.id)).not.toContain(id);
  });

  it('catches a change whose event was missed', async () => {
    const { id, ref } = await open();
    h.source.set(ref, 'rev-9');
    const out = await h.service.reconcile();
    expect(out.stale).toBe(1);
    expect((await h.service.get(id)).status).toBe('stale');
  });

  it('refreshes the checked-at time for unchanged cards, and skips unreadable sources', async () => {
    const { id } = await open();
    h.clock.advance(200);
    await h.service.reconcile();
    expect((await h.service.get(id)).freshness.age_seconds).toBe(0);
    h.clock.advance(200);
    h.source.down = true;
    await h.service.reconcile();
    expect((await h.service.get(id)).freshness.age_seconds).toBe(200);
  });
});

describe('source-freshness: visible freshness', () => {
  it('shows a refresh state when the last check is older than the reconciler interval', async () => {
    const { id } = await open();
    h.clock.advance(60);
    expect((await h.service.get(id)).freshness).toMatchObject({ age_seconds: 60, stale: false });
    h.clock.advance(9 * 60 - 60);
    const view = await h.service.get(id);
    expect(view.freshness).toMatchObject({ age_seconds: 540, stale: true });
    const refreshed = await h.service.refresh(id, 'web');
    expect(refreshed.freshness).toMatchObject({ age_seconds: 0, stale: false });
  });
});
