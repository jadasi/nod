import { describe, expect, it } from 'vitest';
import { validateDecisionRequest } from '@nod/contract';
import {
  ApprovalSync,
  type AwaitResult,
  type ConfirmationsPort,
  type NodPort,
  type StatePort,
} from '../src/sync.js';
import {
  fingerprintOf,
  isHandledConfirmation,
  translateConfirmation,
  type ApprovalLike,
  type ConfirmationLike,
  type IssueRef,
} from '../src/translate.js';

const ACTOR = 'user-1';
const issue: IssueRef = { id: 'is-1', identifier: 'BYT-682', title: 'Karaoke player not visible' };

const confirmation = (over: Partial<ConfirmationLike> = {}): ConfirmationLike => ({
  id: 'cf-1',
  companyId: 'co-1',
  issueId: 'is-1',
  kind: 'request_confirmation',
  status: 'pending',
  payload: {
    version: 1,
    prompt: 'Did you publish Ps 90 and Ps 117?',
    detailsMarkdown: 'Steps: review the records, then run the publish script.',
    acceptLabel: 'Yes, published',
    rejectLabel: 'Not yet',
  },
  updatedAt: new Date('2026-11-15T18:00:00Z'),
  ...over,
});

describe('translateConfirmation', () => {
  it('produces a request the Nod contract accepts, using the card wording', () => {
    const t = translateConfirmation(confirmation(), issue, {
      baseUrl: 'https://pc.test',
      ttlSeconds: 3600,
    });
    expect(validateDecisionRequest(t.request).ok).toBe(true);
    expect(t.request.options.map((o) => o.label)).toEqual(['Yes, published', 'Not yet']);
    expect(t.request.source.ref).toBe('cf-1');
    expect(t.request.glance.question).toBe('Did you publish Ps 90 and Ps 117?');
    expect(t.request.glance.title).toContain('BYT-682');
    expect(t.request.resources).toEqual(['paperclip-interaction:cf-1']);
    expect(JSON.stringify(t.request.evidence)).toContain('https://pc.test/BYT/issues/BYT-682');
    expect(t.actions).toEqual({ accept: 'accept', reject: 'reject' });
  });

  it('offers Confirm and Decline when the card has no wording', () => {
    const t = translateConfirmation(
      confirmation({ payload: { version: 1, prompt: 'Go ahead?' } }),
      issue,
      { ttlSeconds: 3600 },
    );
    expect(t.request.options.map((o) => o.label)).toEqual(['Confirm', 'Decline']);
    expect(validateDecisionRequest(t.request).ok).toBe(true);
  });

  it('keeps long wording within the contract limits', () => {
    const t = translateConfirmation(
      confirmation({
        payload: { version: 1, prompt: 'x'.repeat(500), acceptLabel: 'y'.repeat(80) },
      }),
      { ...issue, title: 'z'.repeat(200) },
      { ttlSeconds: 3600 },
    );
    expect(validateDecisionRequest(t.request).ok).toBe(true);
  });
});

describe('isHandledConfirmation', () => {
  const handled = (c: ConfirmationLike) => isHandledConfirmation(c, ACTOR);
  it('accepts a plain pending confirmation, addressed to nobody or to David', () => {
    expect(handled(confirmation())).toBe(true);
    expect(handled(confirmation({ addresseeUserId: ACTOR }))).toBe(true);
  });
  it.each([
    ['runs a tool', { payload: { version: 1, prompt: 'p', toolAction: { risk: 'write' } } }],
    [
      'grants a secret',
      { payload: { version: 1, prompt: 'p', secretProposal: { proposalId: 'x' } } },
    ],
    [
      'connects an account',
      { payload: { version: 1, prompt: 'p', connectionAuthorization: { providerName: 'Gmail' } } },
    ],
    [
      'decline needs a reason',
      { payload: { version: 1, prompt: 'p', rejectRequiresReason: true } },
    ],
    ['addressed to someone else', { addresseeUserId: 'someone-else' }],
    ['dismissed', { dismissedAt: '2026-11-15T10:00:00Z' }],
    ['workspace still preparing', { acceptanceBlocker: 'workspace_sync_pending' }],
    ['already answered', { status: 'accepted' }],
    ['a checkbox confirmation', { kind: 'request_checkbox_confirmation' }],
    ['a question', { kind: 'ask_user_questions' }],
  ] as [string, Partial<ConfirmationLike>][])('excludes one that %s', (_n, over) => {
    expect(handled(confirmation(over))).toBe(false);
  });
});

// ---- sync ----

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

class FakeConfirmations implements ConfirmationsPort {
  store = new Map<string, ConfirmationLike>();
  responses: { id: string; action: string; actor: string; reason?: string | undefined }[] = [];
  failNext = false;
  async listPending(companyId: string) {
    return [...this.store.values()]
      .filter((c) => c.companyId === companyId && c.status === 'pending')
      .map((c) => ({ confirmation: c, issue }));
  }
  async get(_issueId: string, id: string): Promise<ConfirmationLike | null> {
    return this.store.get(id) ?? null;
  }
  async respond(
    _issueId: string,
    id: string,
    _companyId: string,
    i: { action: 'accept' | 'reject'; actorUserId: string; reason?: string },
  ) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Paperclip refused');
    }
    this.responses.push({ id, action: i.action, actor: i.actorUserId, reason: i.reason });
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

function setup(state = new MemState()) {
  const nod = new FakeNod();
  const confirmations = new FakeConfirmations();
  const approvals: ApprovalLike[] = [];
  const decided: string[] = [];
  const sync = new ApprovalSync({
    nod,
    approvals: {
      listPending: async () => approvals,
      get: async (id) => approvals.find((a) => a.id === id) ?? null,
      decide: async (id) => {
        decided.push(id);
        return { applied: true };
      },
    },
    confirmations,
    state,
    log: { info() {}, warn() {} },
    actorUserId: ACTOR,
    ttlSeconds: 3600,
  });
  return { nod, confirmations, approvals, decided, sync, state };
}

const delivered = (c: ConfirmationLike, option: 'accept' | 'reject'): AwaitResult => ({
  state: 'delivered',
  answer: { option_id: option, other_text: null, fingerprint: fingerprintOf(c) },
});

describe('confirmation sync', () => {
  it('sweep sends a pending confirmation once', async () => {
    const { nod, confirmations, sync } = setup();
    confirmations.store.set('cf-1', confirmation());
    await sync.sweep(['co-1']);
    await sync.sweep(['co-1']);
    expect(nod.submitted).toHaveLength(1);
  });

  it('sends nothing for confirmations Nod cannot answer', async () => {
    const { nod, confirmations, sync } = setup();
    confirmations.store.set(
      'cf-1',
      confirmation({ payload: { version: 1, prompt: 'p', toolAction: { risk: 'write' } } }),
    );
    await sync.sweep(['co-1']);
    expect(nod.submitted).toHaveLength(0);
  });

  it('records an accept after Nod delivers it', async () => {
    const { nod, confirmations, sync } = setup();
    const c = confirmation();
    confirmations.store.set(c.id, c);
    await sync.sweep(['co-1']);
    nod.results.set('d-1', delivered(c, 'accept'));
    await sync.poll();
    expect(confirmations.responses).toEqual([
      { id: 'cf-1', action: 'accept', actor: ACTOR, reason: undefined },
    ]);
    await sync.poll();
    expect(confirmations.responses).toHaveLength(1);
  });

  it('records a decline with a note that it came from Nod', async () => {
    const { nod, confirmations, sync } = setup();
    const c = confirmation();
    confirmations.store.set(c.id, c);
    await sync.sweep(['co-1']);
    nod.results.set('d-1', delivered(c, 'reject'));
    await sync.poll();
    expect(confirmations.responses[0]).toMatchObject({ action: 'reject' });
    expect(confirmations.responses[0]?.reason).toMatch(/Nod/);
  });

  it('writes nothing when the confirmation changed after David answered', async () => {
    const { nod, confirmations, sync } = setup();
    const c = confirmation();
    confirmations.store.set(c.id, c);
    await sync.sweep(['co-1']);
    nod.results.set('d-1', delivered(c, 'accept'));
    confirmations.store.set(c.id, { ...c, updatedAt: new Date('2026-11-15T18:30:00Z') });
    await sync.poll();
    expect(confirmations.responses).toHaveLength(0);
    // The next sweep asks again about the current version.
    await sync.sweep(['co-1']);
    expect(nod.submitted).toHaveLength(2);
  });

  it('withdraws the card when it was answered in Paperclip first', async () => {
    const { nod, confirmations, sync } = setup();
    const c = confirmation();
    confirmations.store.set(c.id, c);
    await sync.sweep(['co-1']);
    confirmations.store.set(c.id, {
      ...c,
      status: 'accepted',
      updatedAt: new Date('2026-11-15T18:05:00Z'),
    });
    await sync.poll();
    expect(nod.withdrawn).toHaveLength(1);
    expect(confirmations.responses).toHaveLength(0);
  });

  it('withdraws the card when the confirmation is gone or its issue closed', async () => {
    const { nod, confirmations, sync } = setup();
    const c = confirmation();
    confirmations.store.set(c.id, c);
    await sync.sweep(['co-1']);
    confirmations.store.delete(c.id);
    await sync.poll();
    expect(nod.withdrawn).toHaveLength(1);
  });

  it('withdraws the card when the confirmation becomes one Nod cannot answer', async () => {
    const { nod, confirmations, sync } = setup();
    const c = confirmation();
    confirmations.store.set(c.id, c);
    await sync.sweep(['co-1']);
    // Same fingerprint, but now dismissed.
    confirmations.store.set(c.id, { ...c, dismissedAt: '2026-11-15T19:00:00Z' });
    await sync.poll();
    expect(nod.withdrawn).toHaveLength(1);
  });

  it('retries on the next tick when Paperclip refuses the write', async () => {
    const { nod, confirmations, sync } = setup();
    const c = confirmation();
    confirmations.store.set(c.id, c);
    await sync.sweep(['co-1']);
    nod.results.set('d-1', delivered(c, 'accept'));
    confirmations.failNext = true;
    await sync.poll();
    expect(confirmations.responses).toHaveLength(0);
    await sync.poll();
    expect(confirmations.responses).toHaveLength(1);
  });

  it('keeps approvals and confirmations separate', async () => {
    const { nod, confirmations, approvals, decided, sync } = setup();
    const a: ApprovalLike = {
      id: 'ap-1',
      companyId: 'co-1',
      type: 'request_board_approval',
      status: 'pending',
      payload: { title: 'Approve the thing' },
      updatedAt: new Date('2026-11-15T17:00:00Z'),
    };
    approvals.push(a);
    const c = confirmation();
    confirmations.store.set(c.id, c);
    await sync.sweep(['co-1']);
    expect(nod.submitted).toHaveLength(2);
    nod.results.set('d-1', {
      state: 'delivered',
      answer: { option_id: 'approve', other_text: null, fingerprint: fingerprintOf(a) },
    });
    nod.results.set('d-2', delivered(c, 'accept'));
    await sync.poll();
    expect(decided).toEqual(['ap-1']);
    expect(confirmations.responses.map((r) => r.id)).toEqual(['cf-1']);
  });

  it('treats a saved link without a kind as an approval', async () => {
    const state = new MemState();
    const a: ApprovalLike = {
      id: 'ap-1',
      companyId: 'co-1',
      type: 'request_board_approval',
      status: 'pending',
      payload: { title: 'Old link' },
      updatedAt: new Date('2026-11-15T17:00:00Z'),
    };
    await state.set('open-links', ['ap-1']);
    await state.set('link:ap-1', {
      decisionId: 'd-9',
      approvalId: 'ap-1',
      companyId: 'co-1',
      fingerprint: fingerprintOf(a),
      actions: { approve: 'approve', reject: 'reject' },
      labels: { approve: 'Approve', reject: 'Reject' },
    });
    const { nod, approvals, decided, sync } = setup(state);
    approvals.push(a);
    nod.results.set('d-9', {
      state: 'delivered',
      answer: { option_id: 'approve', other_text: null, fingerprint: fingerprintOf(a) },
    });
    await sync.poll();
    expect(decided).toEqual(['ap-1']);
  });
});
