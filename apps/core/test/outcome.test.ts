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

async function open(over: Parameters<typeof request>[0] = {}) {
  const ref = `ref-${++n}`;
  h.source.set(ref, 'rev-1');
  const { id } = await h.service.submit(
    'paperclip',
    request({ source: { system: 'paperclip', ref }, ...over }),
  );
  return { id, ref };
}

const code = async (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'ok',
    (e: unknown) => (e instanceof NodError ? e.code : 'other'),
  );

describe('outcome-delivery: undo window', () => {
  it('sends nothing when David undoes inside the window, and reopens the decision', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'android' });
    h.clock.advance(60);
    const view = await h.service.undo(id, 'android');
    expect(view.status).toBe('open');
    h.clock.advance(600);
    await h.service.deliverDue();
    expect(h.source.delivered).toHaveLength(0);
    expect(await events(h.db, id)).toEqual(['created', 'answered', 'undone']);
  });

  it('holds the answer for the full window, then delivers', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'android' });
    h.clock.advance(119);
    expect(await h.service.deliverDue()).toBe(0);
    expect((await h.service.awaitResult('paperclip', id)).state).toBe('waiting');
    h.clock.advance(2);
    expect(await h.service.deliverDue()).toBe(1);
    expect(h.source.delivered).toHaveLength(1);
    expect((await h.service.get(id)).status).toBe('delivered');
  });

  it('cannot undo once the window has ended', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'web' });
    h.clock.advance(121);
    expect(await code(h.service.undo(id, 'web'))).toBe('conflict');
  });

  it('allows a new answer after undo, with a new idempotency key', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'web' });
    await h.service.undo(id, 'web');
    await h.service.answer(id, { option_id: 'wait', surface: 'web' });
    h.clock.advance(121);
    await h.service.deliverDue();
    expect(h.source.delivered.map((d) => [d.optionId, d.idempotencyKey])).toEqual([
      ['wait', `${id}:2`],
    ]);
  });

  it('honours a per-source undo window', async () => {
    await h.db.end();
    h = await harness({ undoWindowBySource: { paperclip: 10 } });
    const { id } = await open();
    await h.service.answer(id, { option_id: 'wait', surface: 'web' });
    h.clock.advance(11);
    expect(await h.service.deliverDue()).toBe(1);
  });
});

describe('outcome-delivery: write approval', () => {
  const externalSend = () =>
    open({
      provenance: { kind: 'external', origin: 'x@y.com' },
      default: { option: 'ship', deadline: '2026-11-13T18:10:00Z' },
    });

  it('does not send a write default for an external request; keeps it open and flags it', async () => {
    const { id } = await externalSend();
    h.clock.advance(11 * 60);
    expect(await h.service.applyDefaultsDue()).toBe(0);
    h.clock.advance(600);
    await h.service.deliverDue();
    const view = await h.service.get(id);
    expect(view.status).toBe('open');
    expect(view.needs_david).toBe(true);
    expect(h.source.delivered).toHaveLength(0);
    expect(await events(h.db, id)).toContain('default_blocked');
    // Repeated sweeps don't spam the audit log.
    await h.service.applyDefaultsDue();
    expect((await events(h.db, id)).filter((e) => e === 'default_blocked')).toHaveLength(1);
  });

  it('refuses a rule or default answer that writes on external input', async () => {
    const { id } = await externalSend();
    expect(await code(h.service.answer(id, { option_id: 'ship', surface: 'rule' }))).toBe(
      'forbidden',
    );
    expect(await code(h.service.answer(id, { option_id: 'ship', surface: 'default' }))).toBe(
      'forbidden',
    );
  });

  it('delivers the write once David chooses it himself', async () => {
    const { id } = await externalSend();
    await h.service.answer(id, { option_id: 'ship', surface: 'glasses' });
    h.clock.advance(121);
    await h.service.deliverDue();
    expect(h.source.delivered).toHaveLength(1);
  });

  it('applies a read-only default on external input, through the undo window', async () => {
    const { id } = await open({
      provenance: { kind: 'external', origin: 'x@y.com' },
      default: { option: 'wait', deadline: '2026-11-13T18:10:00Z' },
    });
    h.clock.advance(11 * 60);
    expect(await h.service.applyDefaultsDue()).toBe(1);
    expect((await h.service.get(id)).answer?.surface).toBe('default');
  });

  it('applies an internal default and keeps an undone default from re-applying', async () => {
    const { id } = await open({ default: { option: 'ship', deadline: '2026-11-13T18:10:00Z' } });
    h.clock.advance(11 * 60);
    expect(await h.service.applyDefaultsDue()).toBe(1);
    await h.service.undo(id, 'android');
    expect(await h.service.applyDefaultsDue()).toBe(0);
    expect((await h.service.get(id)).needs_david).toBe(true);
  });

  it('treats free text as a write for external input', async () => {
    const { id } = await open({ provenance: { kind: 'external', origin: 'x@y.com' } });
    expect(
      await code(h.service.answer(id, { other_text: 'do it differently', surface: 'rule' })),
    ).toBe('forbidden');
  });
});

describe('outcome-delivery: exactly once', () => {
  it('records one answer for a double tap and delivers at most once', async () => {
    const { id } = await open();
    await Promise.all([
      h.service.answer(id, { option_id: 'ship', surface: 'android' }),
      h.service.answer(id, { option_id: 'ship', surface: 'android' }),
    ]);
    const { rows } = await h.db.query('SELECT 1 FROM answers WHERE decision_id = $1', [id]);
    expect(rows).toHaveLength(1);
    h.clock.advance(121);
    await Promise.all([h.service.deliverDue(), h.service.deliverDue()]);
    expect(h.source.delivered).toHaveLength(1);
    expect((await events(h.db, id)).filter((e) => e === 'answered')).toHaveLength(1);
  });

  it('rejects a different answer while one is pending', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'android' });
    expect(await code(h.service.answer(id, { option_id: 'wait', surface: 'android' }))).toBe(
      'conflict',
    );
  });

  it('retries a timed-out delivery with the same idempotency key', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'web' });
    h.clock.advance(121);
    h.source.failNext = 1;
    await h.service.deliverDue();
    expect(h.source.delivered).toHaveLength(0);
    expect((await h.service.get(id)).status).toBe('answered');
    h.clock.advance(31);
    await h.service.deliverDue();
    expect(h.source.delivered.map((d) => d.idempotencyKey)).toEqual([`${id}:1`]);
    expect(await events(h.db, id)).toEqual(['created', 'answered', 'delivery_retry', 'delivered']);
  });

  it('hands the agent the answer and the fingerprint it was checked against', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'web' });
    h.clock.advance(121);
    await h.service.deliverDue();
    const res = await h.service.awaitResult('paperclip', id);
    expect(res.state).toBe('delivered');
    expect(res.answer).toMatchObject({ option_id: 'ship', other_text: null, fingerprint: 'rev-1' });
    expect(res.answer?.delivered_at).toBeTruthy();
  });

  it('delivers free-text answers', async () => {
    const { id } = await open();
    await h.service.answer(id, { other_text: 'ship after the demo', surface: 'call' });
    h.clock.advance(121);
    await h.service.deliverDue();
    expect((await h.service.awaitResult('paperclip', id)).answer).toMatchObject({
      option_id: null,
      other_text: 'ship after the demo',
    });
  });
});

describe('outcome-delivery: audit trail', () => {
  it('records every state change in order, with surface', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'glasses' });
    await h.service.undo(id, 'android');
    await h.service.answer(id, { option_id: 'ship', surface: 'web' });
    h.clock.advance(121);
    await h.service.deliverDue();
    const hist = await h.service.history(id);
    expect(hist.map((e) => [e.event, e.surface])).toEqual([
      ['created', 'agent'],
      ['answered', 'glasses'],
      ['undone', 'android'],
      ['answered', 'web'],
      ['delivered', 'system'],
    ]);
  });

  it('cannot be edited or deleted', async () => {
    const { id } = await open();
    await expect(
      h.db.query('UPDATE audit_log SET event = $1 WHERE decision_id = $2', ['x', id]),
    ).rejects.toThrow(/append-only/);
    await expect(h.db.query('DELETE FROM audit_log WHERE decision_id = $1', [id])).rejects.toThrow(
      /append-only/,
    );
    await expect(h.db.query('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
  });
});

describe('outcome-delivery: failure is visible', () => {
  it('moves a repeatedly failing delivery to Stale & conflicts in plain language', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'web' });
    h.clock.advance(121);
    h.source.failNext = 99;
    for (let i = 0; i < 3; i++) {
      await h.service.deliverDue();
      h.clock.advance(200);
    }
    const view = await h.service.get(id);
    expect(view.status).toBe('failed');
    expect(view.status_reason).toBe("Couldn't send your answer to paperclip: 503 from source");
    expect((await h.service.list('repair')).map((d) => d.id)).toContain(id);
    expect((await h.service.list('inbox')).map((d) => d.id)).not.toContain(id);
    expect(h.source.delivered).toHaveLength(0);
    expect((await events(h.db, id)).at(-1)).toBe('failed');
    expect((await h.service.awaitResult('paperclip', id)).state).toBe('failed');
  });

  it('treats a source outage at send time as a failed attempt, never as "unchanged"', async () => {
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'web' });
    h.clock.advance(121);
    h.source.down = true;
    await h.service.deliverDue();
    expect(h.source.delivered).toHaveLength(0);
    h.source.down = false;
    h.clock.advance(31);
    await h.service.deliverDue();
    expect(h.source.delivered).toHaveLength(1);
  });

  it('refuses to answer when the source cannot be checked', async () => {
    const { id } = await open();
    h.source.down = true;
    expect(await code(h.service.answer(id, { option_id: 'ship', surface: 'web' }))).toBe(
      'source_unavailable',
    );
    expect((await h.service.get(id)).status).toBe('open');
  });
});

describe('kill switch', () => {
  it('logs instead of writing in dry_run, and delivers once the mode returns to live', async () => {
    await h.db.end();
    h = await harness({ deliveryMode: 'dry_run' });
    const { id } = await open();
    await h.service.answer(id, { option_id: 'ship', surface: 'web' });
    h.clock.advance(121);
    await h.service.deliverDue();
    await h.service.deliverDue();
    expect(h.source.delivered).toHaveLength(0);
    expect(await events(h.db, id)).toEqual(['created', 'answered', 'delivery_dry_run']);
    expect((await h.service.get(id)).status).toBe('answered');

    h.config.deliveryMode = 'live';
    await h.service.deliverDue();
    expect(h.source.delivered).toHaveLength(1);
    expect((await h.service.get(id)).status).toBe('delivered');
  });
});
