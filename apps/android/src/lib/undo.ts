/**
 * The undo window is server-authoritative: core holds each answer until
 * `deliver_after`, then re-checks the source and writes. The phone never owns
 * the clock — it derives every countdown from `deliver_after` minus now.
 *
 * To survive backgrounding and process death, a pending answer is persisted
 * (in encrypted storage) the moment it is made. On launch and on returning
 * to the foreground the app reloads the records and reconciles them against
 * core, so the undo bar reappears exactly where it left off.
 */
import type { DecisionView } from '@/api/types.js';
import { BUDGET, fitBudget } from './format.js';

export interface PendingAnswerRecord {
  decisionId: string;
  /** Server timestamp: when the undo window ends and delivery may begin. */
  deliverAfter: string;
  /** Server timestamp: when David answered. */
  answeredAt: string;
  /** What he picked, for the restored UI (e.g. "Merge" or an "Other" text). */
  label: string;
}

/** JSON blob store; the app implementation is backed by expo-secure-store. */
export interface PendingAnswerStore {
  load(): Promise<PendingAnswerRecord[]>;
  save(records: PendingAnswerRecord[]): Promise<void>;
}

/** ms of undo window left, clamped at 0. */
export function remainingMs(deliverAfter: string, now: number): number {
  return Math.max(0, new Date(deliverAfter).getTime() - now);
}

/**
 * The draining meter fraction, 1 -> 0 across the window (the web's bar).
 * Clamped to [0, 1]; a zero-length window reads 0.
 */
export function meterFraction(answeredAt: string, deliverAfter: string, now: number): number {
  const start = new Date(answeredAt).getTime();
  const end = new Date(deliverAfter).getTime();
  const total = end - start;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (end - now) / total));
}

/** Records whose window has not ended yet. */
export function activeRecords(records: readonly PendingAnswerRecord[], now: number) {
  return records.filter((r) => remainingMs(r.deliverAfter, now) > 0);
}

/** Records whose window has ended and whose state must be re-fetched from core. */
export function expiredRecords(records: readonly PendingAnswerRecord[], now: number) {
  return records.filter((r) => remainingMs(r.deliverAfter, now) <= 0);
}

/** Replace the record for a decision (one pending answer per decision). */
export function upsertRecord(
  records: readonly PendingAnswerRecord[],
  record: PendingAnswerRecord,
): PendingAnswerRecord[] {
  return [...records.filter((r) => r.decisionId !== record.decisionId), record];
}

export function removeRecord(
  records: readonly PendingAnswerRecord[],
  decisionId: string,
): PendingAnswerRecord[] {
  return records.filter((r) => r.decisionId !== decisionId);
}

/**
 * Reconcile persisted records against core after a (re)launch: keep the ones
 * whose window is still open, drop the expired ones (the caller already
 * re-fetched those decisions, so their live state — delivered, stale, failed
 * or undone — replaces the record).
 */
export function reconcileRecords(
  records: readonly PendingAnswerRecord[],
  now: number,
): { keep: PendingAnswerRecord[]; toClear: string[] } {
  const keep = activeRecords(records, now);
  return {
    keep,
    toClear: records.filter((r) => !keep.includes(r)).map((r) => r.decisionId),
  };
}

/**
 * True when the decision's live view still offers undo (server agrees the
 * window is open). Used after a refetch to decide whether to keep the record.
 */
export function stillUndoable(d: DecisionView, now: number): boolean {
  return d.answer !== null && d.answer.can_undo && remainingMs(d.answer.deliver_after, now) > 0;
}

/** The label a pending answer showed: the option's label, or the "Other" text. */
export function answerLabel(d: DecisionView, answer: NonNullable<DecisionView['answer']>): string {
  if (answer.option_id !== null) {
    return d.options.find((o) => o.id === answer.option_id)?.label ?? answer.option_id;
  }
  return answer.other_text || 'Your answer';
}

/** A persisted record for a live decision that still offers undo, else null. */
export function pendingRecordFromDecision(d: DecisionView): PendingAnswerRecord | null {
  if (!d.answer || !d.answer.can_undo) return null;
  return {
    decisionId: d.id,
    deliverAfter: d.answer.deliver_after,
    answeredAt: d.answer.answered_at,
    // The label is display text for the restored UI, so it fits the glance
    // question budget. An "Other" answer is uncapped free text from the
    // server contract, and every record rides in one encrypted blob that
    // must stay under expo-secure-store's 2048-byte Android value limit —
    // an overflowing setItemAsync would drop the undo bar after a relaunch.
    label: fitBudget(answerLabel(d, d.answer), BUDGET.question),
  };
}
