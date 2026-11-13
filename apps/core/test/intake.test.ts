import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodError } from '../src/errors.js';
import { events, harness, request, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await harness();
  h.source.set('approval-1', 'rev-1');
});
afterAll(() => h.db.end());

const rejected = async (p: Promise<unknown>): Promise<NodError> => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(NodError);
  return err as NodError;
};

describe('decision-intake', () => {
  it('accepts a valid request, stores it as open and audits created', async () => {
    const out = await h.service.submit(
      'paperclip',
      request({ source: { system: 'paperclip', ref: 'a-valid' } }),
    );
    expect(out).toMatchObject({ status: 'open', deduplicated: false });
    expect(await events(h.db, out.id)).toEqual(['created']);
    expect((await h.service.get(out.id)).status).toBe('open');
  });

  it('rejects glance text that is too long, names the field, and stores nothing', async () => {
    const before = await h.db.query('SELECT count(*) FROM decisions');
    const err = await rejected(
      h.service.submit('paperclip', request({ glance: { title: 't', question: 'x'.repeat(121) } })),
    );
    expect(err.code).toBe('invalid_request');
    expect(err.details.join('\n')).toContain('/glance/question');
    expect(err.details.join('\n')).toContain('120');
    const after = await h.db.query('SELECT count(*) FROM decisions');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('rejects a recommended or default option that does not exist', async () => {
    const a = await rejected(h.service.submit('paperclip', request({ recommended: 'nope' })));
    expect(a.details.join('\n')).toContain('/recommended');
    const b = await rejected(
      h.service.submit(
        'paperclip',
        request({ default: { option: 'nope', deadline: '2026-11-14T00:00:00Z' } }),
      ),
    );
    expect(b.details.join('\n')).toContain('/default/option');
  });

  it('treats a repeated idempotency key from the same source as the same request', async () => {
    const req = request({
      idempotency_key: 'retry-1',
      source: { system: 'paperclip', ref: 'a-idem' },
    });
    const [first, second] = await Promise.all([
      h.service.submit('paperclip', req),
      h.service.submit('paperclip', req),
    ]);
    expect(second.id).toBe(first.id);
    expect([first.deduplicated, second.deduplicated].sort()).toEqual([false, true]);
    const again = await h.service.submit('paperclip', req);
    expect(again).toMatchObject({ id: first.id, deduplicated: true });
    const n = await h.db.query(
      'SELECT count(*)::int AS n FROM decisions WHERE idempotency_key = $1',
      ['retry-1'],
    );
    expect(n.rows[0]).toEqual({ n: 1 });
  });

  it('keeps the same idempotency key separate across sources', async () => {
    const a = await h.service.submit('paperclip', request({ idempotency_key: 'shared' }));
    const b = await h.service.submit(
      'hermes',
      request({ idempotency_key: 'shared', source: { system: 'hermes', ref: 'h-1' } }),
    );
    expect(b.id).not.toBe(a.id);
  });

  it('derives write risk from options, not from the agent', async () => {
    const mixed = await h.service.submit(
      'paperclip',
      request({ source: { system: 'paperclip', ref: 'a-mixed' } }),
    );
    expect((await h.service.get(mixed.id)).risk).toBe('write');
    const readOnly = await h.service.submit(
      'paperclip',
      request({
        source: { system: 'paperclip', ref: 'a-ro' },
        options: [
          { id: 'a', label: 'A', outcome: 'x', reversible: true, writes: false },
          { id: 'b', label: 'B', outcome: 'y', reversible: true, writes: false },
        ],
        recommended: 'a',
      }),
    );
    expect((await h.service.get(readOnly.id)).risk).toBe('low');
  });

  it('refuses a token submitting for another source', async () => {
    const err = await rejected(h.service.submit('hermes', request()));
    expect(err.code).toBe('forbidden');
  });

  it('keeps a request alive while the agent heartbeats', async () => {
    const { id } = await h.service.submit(
      'paperclip',
      request({ ttl_seconds: 60, source: { system: 'paperclip', ref: 'a-hb' } }),
    );
    h.clock.advance(50);
    await h.service.heartbeat('paperclip', id);
    h.clock.advance(50); // 100s since creation, 50s since heartbeat
    expect(await h.service.expireDue()).toBe(0);
    expect((await h.service.get(id)).status).toBe('open');
  });

  it('withdraws a request as "agent stopped" when heartbeats stop', async () => {
    const { id } = await h.service.submit(
      'paperclip',
      request({ ttl_seconds: 60, source: { system: 'paperclip', ref: 'a-dead' } }),
    );
    h.clock.advance(61);
    await h.service.expireDue();
    const view = await h.service.get(id);
    expect(view.status).toBe('expired');
    expect(view.status_reason).toBe('agent stopped');
    expect((await h.service.list('inbox')).map((d) => d.id)).not.toContain(id);
    expect(await events(h.db, id)).toEqual(['created', 'expired']);
    expect((await h.service.awaitResult('paperclip', id)).state).toBe('expired');
  });

  it('lets the agent withdraw its own request, and nobody else', async () => {
    const { id } = await h.service.submit(
      'paperclip',
      request({ source: { system: 'paperclip', ref: 'a-wd' } }),
    );
    expect((await rejected(h.service.withdraw('hermes', id))).code).toBe('not_found');
    await h.service.withdraw('paperclip', id);
    expect((await h.service.get(id)).status).toBe('withdrawn');
    expect(await events(h.db, id)).toEqual(['created', 'withdrawn']);
  });

  it('records notify and report_progress for the Updates tab', async () => {
    await h.service.addUpdate('paperclip', {
      kind: 'notify',
      title: 'Deploy finished',
      level: 'info',
    });
    await h.service.addUpdate('paperclip', { kind: 'progress', title: '3 of 5 tasks done' });
    const ups = await h.service.listUpdates();
    expect(ups.map((u) => u.title)).toEqual(['3 of 5 tasks done', 'Deploy finished']);
  });
});
