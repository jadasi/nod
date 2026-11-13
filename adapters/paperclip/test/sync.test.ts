import { describe, expect, it } from 'vitest';
import { validateDecisionRequest } from '@nod/contract';
import {
  ApprovalSync,
  type AwaitResult,
  type NodPort,
  type ApprovalsPort,
  type StatePort,
} from '../src/sync.js';
import { fingerprintOf, translate, type ApprovalLike } from '../src/translate.js';

const approval = (over: Partial<ApprovalLike> = {}): ApprovalLike => ({
  id: 'ap-1',
  companyId: 'co-1',
  type: 'request_board_approval',
  status: 'pending',
  payload: {
    title: 'Switch the billing emails to the new template',
    summary: 'Customers get a redesigned invoice email starting tomorrow.',
    recommendedAction: 'Roll out to all customers',
    risks: ['Template untested on old mail clients'],
  },
  updatedAt: new Date('2026-11-13T18:00:00Z'),
  ...over,
});

class FakeNod implements NodPort {
  submitted: Record<string, unknown>[] = [];
  withdrawn: { id: string; reason: string }[] = [];
  results = new Map<string, AwaitResult>();
  async submit(request: unknown): Promise<{ id: string }> {
    this.submitted.push(request as Record<string, unknown>);
    return { id: `d-${this.submitted.length}` };
  }
  async await(id: string): Promise<AwaitResult> {
    return this.results.get(id) ?? { state: 'waiting' };
  }
  async withdraw(id: string, reason: string): Promise<void> {
    this.withdrawn.push({ id, reason });
  }
}

class FakeApprovals implements ApprovalsPort {
  store = new Map<string, ApprovalLike>();
  decisions: { id: string; action: string; actor: string; note: string }[] = [];
  async listPending(companyId: string): Promise<ApprovalLike[]> {
    return [...this.store.values()].filter(
      (a) => a.companyId === companyId && a.status === 'pending',
    );
  }
  async get(id: string): Promise<ApprovalLike | null> {
    return this.store.get(id) ?? null;
  }
  async decide(
    id: string,
    _c: string,
    i: { action: 'approve' | 'reject'; actorUserId: string; decisionNote: string },
  ) {
    this.decisions.push({ id, action: i.action, actor: i.actorUserId, note: i.decisionNote });
    return { applied: true };
  }
}

class MemState implements StatePort {
  m = new Map<string, unknown>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async set(k: string, v: unknown) {
    this.m.set(k, v);
  }
  async delete(k: string) {
    this.m.delete(k);
  }
}

function setup() {
  const nod = new FakeNod();
  const approvals = new FakeApprovals();
  const sync = new ApprovalSync({
    nod,
    approvals,
    state: new MemState(),
    log: { info() {}, warn() {} },
    actorUserId: 'user-1',
    ttlSeconds: 3600,
  });
  return { nod, approvals, sync };
}

describe('translate', () => {
  it('produces a request the Nod contract accepts, with plain Approve / Reject', () => {
    const t = translate(approval(), { ttlSeconds: 3600 });
    const check = validateDecisionRequest(t.request);
    expect(check.ok).toBe(true);
    expect(t.request.options.map((o) => o.id)).toEqual(['approve', 'reject']);
    expect(t.actions).toEqual({ approve: 'approve', reject: 'reject' });
    expect(check.risk).toBe('write');
    expect(t.request.provenance.kind).toBe('internal');
  });

  it('keeps glance text within the glasses limits', () => {
    const long = 'x'.repeat(400);
    const t = translate(
      approval({ payload: { title: long, summary: long, recommendedAction: long } }),
      { ttlSeconds: 3600 },
    );
    expect(t.request.glance.title.length).toBeLessThanOrEqual(48);
    expect(t.request.glance.question.length).toBeLessThanOrEqual(120);
    expect(t.request.impact.length).toBeLessThanOrEqual(600);
    expect(validateDecisionRequest(t.request).ok).toBe(true);
  });

  it('uses custom options from the nod block, each mapped to approve or reject', () => {
    const t = translate(
      approval({
        payload: {
          title: 'Pick a vendor',
          nod: {
            impact: 'Support tickets get answered faster.',
            recommended: 'vendor-a',
            options: [
              {
                id: 'vendor-a',
                label: 'Vendor A',
                outcome: 'Faster, costs more.',
                decision: 'approve',
              },
              {
                id: 'none',
                label: 'Keep current',
                outcome: 'Nothing changes.',
                decision: 'reject',
              },
            ],
          },
        },
      }),
      { ttlSeconds: 3600 },
    );
    expect(t.request.recommended).toBe('vendor-a');
    expect(t.actions).toEqual({ 'vendor-a': 'approve', none: 'reject' });
    expect(t.request.options.find((o) => o.id === 'none')?.writes).toBe(false);
    expect(validateDecisionRequest(t.request).ok).toBe(true);
  });

  it('falls back to Approve / Reject when custom options are malformed', () => {
    const t = translate(
      approval({
        payload: {
          nod: { options: [{ id: 'Bad Id', label: 'x', outcome: 'y', decision: 'approve' }] },
        },
      }),
      {
        ttlSeconds: 3600,
      },
    );
    expect(t.request.options.map((o) => o.id)).toEqual(['approve', 'reject']);
  });

  it('fingerprints change when the approval is revised', () => {
    const a = approval();
    expect(fingerprintOf(a)).not.toBe(
      fingerprintOf({ ...a, updatedAt: new Date('2026-11-13T19:00:00Z') }),
    );
    expect(fingerprintOf(a)).not.toBe(fingerprintOf({ ...a, status: 'revision_requested' }));
  });
});

describe('ApprovalSync', () => {
  it('sends a pending approval to Nod once, even if the event repeats', async () => {
    const { nod, sync } = setup();
    await sync.onApproval(approval());
    await sync.onApproval(approval());
    expect(nod.submitted).toHaveLength(1);
  });

  it('ignores approvals Nod cannot act on', async () => {
    const { nod, sync } = setup();
    await sync.onApproval(approval({ type: 'budget_override_required' }));
    await sync.onApproval(approval({ status: 'revision_requested' }));
    expect(nod.submitted).toHaveLength(0);
  });

  it('writes the answer back after Nod delivers it', async () => {
    const { nod, approvals, sync } = setup();
    const a = approval();
    approvals.store.set(a.id, a);
    await sync.onApproval(a);
    nod.results.set('d-1', {
      state: 'delivered',
      answer: { option_id: 'approve', other_text: null, fingerprint: fingerprintOf(a) },
    });
    await sync.poll();
    expect(approvals.decisions).toEqual([
      { id: 'ap-1', action: 'approve', actor: 'user-1', note: 'Answered in Nod: Approve' },
    ]);
    await sync.poll();
    expect(approvals.decisions).toHaveLength(1);
  });

  it('maps Reject to a rejection', async () => {
    const { nod, approvals, sync } = setup();
    const a = approval();
    approvals.store.set(a.id, a);
    await sync.onApproval(a);
    nod.results.set('d-1', {
      state: 'delivered',
      answer: { option_id: 'reject', other_text: null, fingerprint: fingerprintOf(a) },
    });
    await sync.poll();
    expect(approvals.decisions[0]?.action).toBe('reject');
  });

  it('does not write when the approval changed after David answered', async () => {
    const { nod, approvals, sync } = setup();
    const a = approval();
    approvals.store.set(a.id, a);
    await sync.onApproval(a);
    approvals.store.set(a.id, { ...a, updatedAt: new Date('2026-11-13T19:00:00Z') });
    nod.results.set('d-1', {
      state: 'delivered',
      answer: { option_id: 'approve', other_text: null, fingerprint: fingerprintOf(a) },
    });
    await sync.poll();
    expect(approvals.decisions).toHaveLength(0);
    // The sweep asks again about the new version.
    await sync.sweep(['co-1']);
    expect(nod.submitted).toHaveLength(2);
  });

  it('does not write when the approval was already decided in Paperclip', async () => {
    const { nod, approvals, sync } = setup();
    const a = approval();
    approvals.store.set(a.id, a);
    await sync.onApproval(a);
    approvals.store.set(a.id, { ...a, status: 'approved' });
    nod.results.set('d-1', {
      state: 'delivered',
      answer: { option_id: 'approve', other_text: null, fingerprint: fingerprintOf(a) },
    });
    await sync.poll();
    expect(approvals.decisions).toHaveLength(0);
  });

  it('withdraws the card when the approval is decided in Paperclip', async () => {
    const { nod, sync } = setup();
    await sync.onApproval(approval());
    await sync.onDecided(approval({ status: 'approved' }));
    expect(nod.withdrawn).toEqual([{ id: 'd-1', reason: 'Resolved in Paperclip' }]);
  });

  it('withdraws the card when the approval is sent back for revision', async () => {
    const { nod, approvals, sync } = setup();
    const a = approval();
    approvals.store.set(a.id, { ...a, status: 'revision_requested' });
    await sync.onApproval(a);
    await sync.poll();
    expect(nod.withdrawn).toHaveLength(1);
  });

  it('replaces the card when the agent resubmits a revised approval', async () => {
    const { nod, sync } = setup();
    await sync.onApproval(approval());
    await sync.onApproval(approval({ updatedAt: new Date('2026-11-13T20:00:00Z') }));
    expect(nod.withdrawn).toHaveLength(1);
    expect(nod.submitted).toHaveLength(2);
  });

  it('sweep catches approvals whose event was missed', async () => {
    const { nod, approvals, sync } = setup();
    approvals.store.set('ap-1', approval());
    approvals.store.set('ap-2', approval({ id: 'ap-2' }));
    await sync.sweep(['co-1']);
    expect(nod.submitted).toHaveLength(2);
    await sync.sweep(['co-1']);
    expect(nod.submitted).toHaveLength(2);
  });

  it('keeps waiting while Nod is holding the answer, and drops closed decisions', async () => {
    const { nod, approvals, sync } = setup();
    const a = approval();
    approvals.store.set(a.id, a);
    await sync.onApproval(a);
    await sync.poll();
    expect(approvals.decisions).toHaveLength(0);
    nod.results.set('d-1', { state: 'expired' });
    await sync.poll();
    expect(approvals.decisions).toHaveLength(0);
  });

  it('retries on the next tick when Paperclip rejects the write', async () => {
    const { nod, approvals, sync } = setup();
    const a = approval();
    approvals.store.set(a.id, a);
    await sync.onApproval(a);
    nod.results.set('d-1', {
      state: 'delivered',
      answer: { option_id: 'approve', other_text: null, fingerprint: fingerprintOf(a) },
    });
    const real = approvals.decide.bind(approvals);
    let fail = true;
    approvals.decide = async (...args) => {
      if (fail) {
        fail = false;
        throw new Error('503');
      }
      return real(...args);
    };
    await sync.poll();
    expect(approvals.decisions).toHaveLength(0);
    await sync.poll();
    expect(approvals.decisions).toHaveLength(1);
  });
});
