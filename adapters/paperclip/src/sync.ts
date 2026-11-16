import {
  fingerprintOf,
  isHandled,
  isHandledConfirmation,
  translate,
  translateConfirmation,
  type ApprovalLike,
  type ConfirmationLike,
  type IssueRef,
  type ItemAction,
  type PaperclipAction,
  type TranslatedApproval,
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

/** Issue-thread confirmations, as this adapter reads and answers them. */
export interface ConfirmationsPort {
  /** Pending confirmations on open issues in this company, with the issue each sits on. */
  listPending(companyId: string): Promise<{ confirmation: ConfirmationLike; issue: IssueRef }[]>;
  get(issueId: string, interactionId: string, companyId: string): Promise<ConfirmationLike | null>;
  respond(
    issueId: string,
    interactionId: string,
    companyId: string,
    input: { action: 'accept' | 'reject'; actorUserId: string; reason?: string },
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
  /** Absent when confirmations aren't wired in; approvals still work. */
  confirmations?: ConfirmationsPort | undefined;
  state: StatePort;
  log: Logger;
  /** Board member the answer is attributed to in Paperclip. */
  actorUserId: string;
  baseUrl?: string | undefined;
  ttlSeconds: number;
}

/** What we remember about one open decision. */
interface Link {
  /** Links saved before confirmations existed have no kind and are approvals. */
  kind?: 'approval' | 'confirmation';
  decisionId: string;
  /** The id of the approval or confirmation (kept under this name for saved links). */
  approvalId: string;
  /** Confirmations only: the issue they sit on. */
  issueId?: string;
  companyId: string;
  fingerprint: string;
  actions: Record<string, ItemAction>;
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

  /** A pending confirmation: ask David once per revision, unless it is one Nod can't answer. */
  async onConfirmation(c: ConfirmationLike, issue: IssueRef): Promise<void> {
    const existing = await this.link(c.id);
    if (!isHandledConfirmation(c, this.d.actorUserId)) {
      // It may have become unanswerable after we sent it (dismissed, re-addressed): close the card.
      if (existing) await this.closeCard(existing, 'No longer something Nod can answer');
      return;
    }
    const fp = fingerprintOf(c);
    if (existing?.fingerprint === fp) return;
    if (existing) {
      await this.d.nod
        .withdraw(existing.decisionId, 'The confirmation was changed in Paperclip')
        .catch((e: unknown) =>
          this.d.log.warn('withdraw of superseded decision failed', { error: String(e) }),
        );
    }
    const t: TranslatedApproval = translateConfirmation(c, issue, {
      baseUrl: this.d.baseUrl,
      ttlSeconds: this.d.ttlSeconds,
    });
    const { id } = await this.d.nod.submit(t.request);
    await this.save({
      kind: 'confirmation',
      decisionId: id,
      approvalId: c.id,
      issueId: c.issueId,
      companyId: c.companyId,
      fingerprint: fp,
      actions: t.actions,
      labels: t.labels,
    });
    this.d.log.info('confirmation sent to Nod', { confirmationId: c.id, decisionId: id });
  }

  private async closeCard(l: Link, reason: string): Promise<void> {
    await this.d.nod
      .withdraw(l.decisionId, reason)
      .catch((e: unknown) => this.d.log.warn('withdraw failed', { error: String(e) }));
    await this.forget(l.approvalId);
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

  /**
   * Catch approvals whose creation event was missed (plugin down, restart), and find new
   * confirmations (Paperclip announces no event for them, so this is how they are found).
   */
  async sweep(companyIds: string[]): Promise<void> {
    // Keep going so one failure doesn't hide the rest, then fail so the job run shows it.
    const failures: string[] = [];
    for (const companyId of companyIds) {
      for (const a of await this.d.approvals.listPending(companyId)) {
        await this.onApproval(a).catch((e: unknown) =>
          this.d.log.warn('sweep: could not send approval', { approvalId: a.id, error: String(e) }),
        );
      }
      if (!this.d.confirmations) continue;
      const pending = await this.d.confirmations.listPending(companyId).catch((e: unknown) => {
        this.d.log.warn('sweep: could not list confirmations', { companyId, error: String(e) });
        failures.push(`could not read confirmations for ${companyId}: ${String(e)}`);
        return [];
      });
      for (const { confirmation, issue } of pending) {
        await this.onConfirmation(confirmation, issue).catch((e: unknown) =>
          this.d.log.warn('sweep: could not send confirmation', {
            confirmationId: confirmation.id,
            error: String(e),
          }),
        );
      }
    }
    if (failures.length > 0) throw new Error(failures.join('; '));
  }

  /**
   * Check every open decision for an answer, and apply the ones that are ready. With `companyId`,
   * only that company's decisions (each company has its own Nod config).
   */
  async poll(companyId?: string): Promise<void> {
    for (const approvalId of await this.openIds()) {
      const l = await this.link(approvalId);
      if (!l) {
        await this.forget(approvalId);
        continue;
      }
      if (companyId !== undefined && l.companyId !== companyId) continue;
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
        const current = await this.read(l);
        if (!current || current.fingerprint !== l.fingerprint || !current.answerable) {
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

  /** The item's current fingerprint, and whether it is still something Nod may answer. */
  private async read(l: Link): Promise<{ fingerprint: string; answerable: boolean } | null> {
    if (l.kind === 'confirmation') {
      const c = await this.d.confirmations?.get(l.issueId ?? '', l.approvalId, l.companyId);
      if (!c) return null;
      return {
        fingerprint: fingerprintOf(c),
        answerable: isHandledConfirmation(c, this.d.actorUserId),
      };
    }
    const a = await this.d.approvals.get(l.approvalId, l.companyId);
    return a ? { fingerprint: fingerprintOf(a), answerable: true } : null;
  }

  private async write(l: Link, action: ItemAction, label: string): Promise<{ applied: boolean }> {
    if (l.kind === 'confirmation') {
      if (!this.d.confirmations) throw new Error('confirmations are not available');
      const reject = action === 'reject';
      return this.d.confirmations.respond(l.issueId ?? '', l.approvalId, l.companyId, {
        action: reject ? 'reject' : 'accept',
        actorUserId: this.d.actorUserId,
        // Paperclip takes a note on a decline only.
        ...(reject ? { reason: `Declined in Nod: ${label}` } : {}),
      });
    }
    return this.d.approvals.decide(l.approvalId, l.companyId, {
      action: action as PaperclipAction,
      actorUserId: this.d.actorUserId,
      decisionNote: `Answered in Nod: ${label}`,
    });
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
    const current = await this.read(l);
    if (!current || current.fingerprint !== r.answer?.fingerprint || !current.answerable) {
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
      res = await this.write(l, action, l.labels[optionId] ?? optionId);
    } catch (e) {
      await this.save({ ...l, applying: false });
      throw e;
    }
    this.d.log.info('answer written to Paperclip', {
      approvalId: l.approvalId,
      kind: l.kind ?? 'approval',
      action,
      applied: res.applied,
    });
    await this.forget(l.approvalId);
  }
}
