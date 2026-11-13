import { afterAll, beforeAll, expect, it } from 'vitest';
import { harness, type Harness } from '../../../apps/core/test/helpers.js';
import { AdapterRegistry } from '../../../apps/core/src/source.js';
import { DecisionService } from '../../../apps/core/src/service.js';
import { ApprovalSync, type ApprovalsPort, type NodPort, type StatePort } from '../src/sync.js';
import { fingerprintOf, type ApprovalLike } from '../src/translate.js';

/**
 * The adapter against the real core service and Postgres. Paperclip is passive in core (core cannot
 * read it), so this exercises exactly what runs in production: undo window, then the plugin's
 * own compare-and-swap before it writes.
 */
let h: Harness;
let service: DecisionService;
beforeAll(async () => {
  h = await harness();
  service = new DecisionService(h.db, new AdapterRegistry(), h.config, h.clock);
});
afterAll(() => h.db.end());

const nod: NodPort = {
  submit: (r) => service.submit('paperclip', r),
  await: async (id) => (await service.awaitResult('paperclip', id)) as never,
  withdraw: (id, reason) => service.withdraw('paperclip', id, reason),
};

const approval: ApprovalLike = {
  id: 'ap-9',
  companyId: 'co-1',
  type: 'request_board_approval',
  status: 'pending',
  payload: {
    title: 'Rotate the signing keys',
    summary: 'Partners must re-download the new key.',
    recommendedAction: 'Rotate now',
  },
  updatedAt: new Date('2026-11-13T18:00:00Z'),
};

function build(store: Map<string, ApprovalLike>, decisions: string[]) {
  const mem = new Map<string, unknown>();
  const state: StatePort = {
    get: async (k) => mem.get(k) ?? null,
    set: async (k, v) => void mem.set(k, v),
    delete: async (k) => void mem.delete(k),
  };
  const approvals: ApprovalsPort = {
    listPending: async () => [...store.values()].filter((a) => a.status === 'pending'),
    get: async (id) => store.get(id) ?? null,
    decide: async (id, _c, i) => {
      decisions.push(`${id}:${i.action}`);
      store.set(id, {
        ...store.get(id)!,
        status: i.action === 'approve' ? 'approved' : 'rejected',
      });
      return { applied: true };
    },
  };
  return new ApprovalSync({
    nod,
    approvals,
    state,
    log: { info() {}, warn() {} },
    actorUserId: 'u1',
    ttlSeconds: 3600,
  });
}

it('approval → card → answer → undo window → written back to Paperclip', async () => {
  const store = new Map([[approval.id, approval]]);
  const decisions: string[] = [];
  const sync = build(store, decisions);

  await sync.sweep(['co-1']);
  const { rows } = await h.db.query<{ id: string; fingerprint: string }>(
    'SELECT id, fingerprint FROM decisions',
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.fingerprint).toBe(fingerprintOf(approval));
  const id = rows[0]!.id;

  await service.answer(id, { option_id: 'approve', surface: 'web' });
  await sync.poll();
  expect(decisions).toEqual([]); // still inside the undo window

  h.clock.advance(121);
  await service.deliverDue();
  await sync.poll();
  expect(decisions).toEqual(['ap-9:approve']);
  expect(store.get('ap-9')?.status).toBe('approved');
});

it('an answer made against a version that changed is never written', async () => {
  const a = { ...approval, id: 'ap-10' };
  const store = new Map([[a.id, a]]);
  const decisions: string[] = [];
  const sync = build(store, decisions);
  await sync.sweep(['co-1']);
  const { rows } = await h.db.query<{ id: string }>(
    `SELECT id FROM decisions WHERE source_ref = 'ap-10'`,
  );
  const id = rows[0]!.id;

  await service.answer(id, { option_id: 'approve', surface: 'web' });
  store.set(a.id, { ...a, updatedAt: new Date('2026-11-13T21:00:00Z') }); // agent resubmitted
  h.clock.advance(121);
  await service.deliverDue();
  await sync.poll();
  expect(decisions).toEqual([]);
});
