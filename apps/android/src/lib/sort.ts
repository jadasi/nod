import type { DecisionView } from '@/api/types.js';

/**
 * Inbox order: urgent first, then oldest first (it has waited longest).
 *
 * Settled ordering, ported from `apps/web/public/lib.js` (`sortInbox`) so the
 * phone and the desk show the same order.
 */
export function sortInbox(list: readonly DecisionView[]): DecisionView[] {
  return [...list].sort((a, b) => {
    const u = Number(b.urgency === 'urgent') - Number(a.urgency === 'urgent');
    return u !== 0 ? u : a.created_at.localeCompare(b.created_at);
  });
}

/** True for decisions that still need an answer (the "Needs you" filter). */
export function needsYou(d: DecisionView): boolean {
  return d.status === 'open' && !d.answer;
}
