import {
  fingerprintOf,
  isHandled,
  translate,
  type ApprovalLike,
  type PaperclipAction,
} from './translate.js';

export type AwaitState =
  | 'waiting'
  | 'delivered'
  | 'stale'
  | 'reask'
  | 'failed'
  | 'withdrawn'
  | 'expired'
  | 'resolved_outside';

export interface AwaitResult {
  state: AwaitState;
  reason?: string | undefined;
  answer?: {
    option_id: string | null;
    other_text: string | null;
    fingerprint: string;
  };
}

/** Nod's agent API, as this adapter uses it. */
export interface NodPort {
  submit(request: unknown): Promise<{ id: string }>;
  /** Non-blocking: returns the current state (and keeps the request alive). */
  await(decisionId: string): Promise<AwaitResult>;
  withdraw(decisionId: string, reason: string): Promise<void>;
}

export interface ApprovalsPort {
  listPending(companyId: string): Promise<ApprovalLike[]>;
  get(approvalId: string, companyId: string): Promise<ApprovalLike | null>;
  decide(
    approvalId: string,
    companyId: string,
    input: { action: PaperclipAction; actorUserId: string; decisionNote: string },
  ): Promise<{ applied: boolean }>;
}

export interface StatePort {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

export interface SyncDeps {
  nod: NodPort;
  approvals: ApprovalsPort;
  state: StatePort;
  log: Logger;
  /** Board member the answer is attributed to in Paperclip. */
  actorUserId: string;
  baseUrl?: string | undefined;
  ttlSeconds: number;
}

/** What we remember about one open decision. */
interface Link {
  decisionId: string;
  approvalId: string;
  companyId: string;
  fingerprint: string;
  actions: Record<string, PaperclipAction>;
  labels: Record<string, string>;
  /** Set while we write the answer, so the resulting `approval.decided` event isn't mistaken for an outside change. */
  applying?: boolean;
}

const OPEN_KEY = 'open-links';
const linkKey = (approvalId: string): string => `link:${approvalId}`;

/**
 * Connects Paperclip approvals to Nod decisions. Nod holds each answer through its undo window, so
 * "delivered" from Nod means the window passed. This adapter then does the compare-and-swap Nod
 * can't do for it: it re-reads the approval and writes only if it is still the one David saw.
 */
export class ApprovalSync {
  constructor(private readonly d: SyncDeps) {}

  private async openIds(): Promise<string[]> {
    const v = await this.d.state.get(OPEN_KEY);
    return Array.isArray(v) ? (v as string[]) : [];
  }

  private async link(approvalId: string): Promise<Link | null> {
    const v = await this.d.state.get(linkKey(approvalId));
    return v ? (v as Link) : null;
  }

  private async save(l: Link): Promise<void> {
    await this.d.state.set(linkKey(l.approvalId), l);
    const ids = await this.openIds();
    if (!ids.includes(l.approvalId)) await this.d.state.set(OPEN_KEY, [...ids, l.approvalId]);
  }

  private async forget(approvalId: string): Promise<void> {
    await this.d.state.delete(linkKey(approvalId));
    await this.d.state.set(
      OPEN_KEY,
      (await this.openIds()).filter((i) => i !== approvalId),
    );
  }

  /** A new or changed approval: ask David (once per revision of the approval). */
  async onApproval(a: ApprovalLike): Promise<void> {
    if (!isHandled(a)) return;
    const existing = await this.link(a.id);
    const fp = fingerprintOf(a);
    if (existing?.fingerprint === fp) return;
    if (existing) {
      // Resubmitted after a revision request: the old card is about a version that no longer exists.
      await this.d.nod
        .withdraw(existing.decisionId, 'The approval was changed in Paperclip')
        .catch((e: unknown) =>
          this.d.log.warn('withdraw of superseded decision failed', { error: String(e) }),
        );
    }
    const t = translate(a, { baseUrl: this.d.baseUrl, ttlSeconds: this.d.ttlSeconds });
    const { id } = await this.d.nod.submit(t.request);
    await this.save({
      decisionId: id,
      approvalId: a.id,
      companyId: a.companyId,
      fingerprint: fp,
      actions: t.actions,
      labels: t.labels,
    });
    this.d.log.info('approval sent to Nod', { approvalId: a.id, decisionId: id });
  }

  /** Decided in Paperclip (by anyone): the card no longer has anything to ask. */
  async onDecided(a: ApprovalLike): Promise<void> {
    const l = await this.link(a.id);
    if (!l || l.applying) return;
    await this.d.nod
      .withdraw(l.decisionId, 'Resolved in Paperclip')
      .catch((e: unknown) => this.d.log.warn('withdraw failed', { error: String(e) }));
    await this.forget(a.id);
  }

  /** Catch approvals whose creation event was missed (plugin down, restart). */
  async sweep(companyIds: string[]): Promise<void> {
    for (const companyId of companyIds) {
      for (const a of await this.d.approvals.listPending(companyId)) {
        await this.onApproval(a).catch((e: unknown) =>
          this.d.log.warn('sweep: could not send approval', { approvalId: a.id, error: String(e) }),
        );
      }
    }
  }

  /** Check every open decision for an answer, and apply the ones that are ready. */
  async poll(): Promise<void> {
    for (const approvalId of await this.openIds()) {
      const l = await this.link(approvalId);
      if (!l) {
        await this.forget(approvalId);
        continue;
      }
      try {
        await this.pollOne(l);
      } catch (e) {
        // Leave the link in place: the next tick retries.
        this.d.log.warn('poll failed', { approvalId, error: String(e) });
      }
    }
  }

  private async pollOne(l: Link): Promise<void> {
    const r = await this.d.nod.await(l.decisionId);
    switch (r.state) {
      case 'waiting': {
        // Nod can't read Paperclip, so this is the reconciler for outside changes: decided elsewhere,
        // sent back for revision, or resubmitted. Any of those makes the card about something stale.
        const current = await this.d.approvals.get(l.approvalId, l.companyId);
        if (!current || fingerprintOf(current) !== l.fingerprint) {
          await this.d.nod.withdraw(l.decisionId, 'Changed in Paperclip');
          await this.forget(l.approvalId);
        }
        return;
      }
      case 'delivered':
        await this.apply(l, r);
        return;
      default:
        // stale / reask / withdrawn / expired / resolved_outside / failed: nothing to write.
        // The sweep re-asks if the approval is still pending (fresh fingerprint, fresh card).
        this.d.log.info('decision closed without a write', {
          approvalId: l.approvalId,
          state: r.state,
          reason: r.reason,
        });
        await this.forget(l.approvalId);
    }
  }

  private async apply(l: Link, r: AwaitResult): Promise<void> {
    const optionId = r.answer?.option_id ?? null;
    const action = optionId ? l.actions[optionId] : undefined;
    if (!optionId || !action) {
      // Nod never offers an option we didn't submit, so this means the answer is unusable: don't guess.
      this.d.log.warn('answer has no matching option; not written', {
        approvalId: l.approvalId,
        optionId,
      });
      await this.forget(l.approvalId);
      return;
    }
    const current = await this.d.approvals.get(l.approvalId, l.companyId);
    if (!current || fingerprintOf(current) !== r.answer?.fingerprint) {
      // Compare-and-swap failed: the approval moved on after David looked. Writing now could
      // approve something he never saw. Drop it; the sweep asks again if it is still pending.
      this.d.log.warn('approval changed since the answer; not written', {
        approvalId: l.approvalId,
      });
      await this.forget(l.approvalId);
      return;
    }
    await this.save({ ...l, applying: true });
    let res: { applied: boolean };
    try {
      res = await this.d.approvals.decide(l.approvalId, l.companyId, {
        action,
        actorUserId: this.d.actorUserId,
        decisionNote: `Answered in Nod: ${l.labels[optionId] ?? optionId}`,
      });
    } catch (e) {
      await this.save({ ...l, applying: false });
      throw e;
    }
    this.d.log.info('answer written to Paperclip', {
      approvalId: l.approvalId,
      action,
      applied: res.applied,
    });
    await this.forget(l.approvalId);
  }
}
