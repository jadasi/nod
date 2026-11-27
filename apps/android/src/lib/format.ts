/**
 * Display helpers, ported from `apps/web/public/lib.js` so the phone and the
 * desk say the same thing the same way. Pure functions, unit tested.
 */
import type { AnswerView, DecisionView } from '@/api/types.js';

/** 107000 ms -> "1:47". Never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The glance budget for the lenses: title 48, question 120. */
export const BUDGET = { title: 48, question: 120 } as const;

/**
 * Fits text to a character budget, cutting with an ellipsis.
 *
 * The cut lands on a word boundary when one is close enough to the end.
 * This text is read at a glance — on the lenses and on a heads-up
 * notification — and a word broken in half costs a re-read, which is the
 * one thing a glance cannot afford. A boundary further back than 70% of
 * the budget would throw away more than it saves, so that falls back to a
 * hard cut. Trailing punctuation goes with the cut word.
 */
export function fitBudget(text: string, max: number): string {
  if (text.length <= max) return text;
  const hard = text.slice(0, max - 1);
  const lastSpace = hard.lastIndexOf(' ');
  const body = lastSpace >= Math.floor((max - 1) * 0.7) ? hard.slice(0, lastSpace) : hard;
  return `${body.replace(/[\s,;:.–—-]+$/, '')}…`;
}

/** "checked 40s ago" / "checked 3m ago". */
export function formatAge(seconds: number): string {
  if (seconds < 90) return `${Math.max(0, Math.floor(seconds))}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * What the answer banner should say right now. `now` is server-corrected ms.
 * Returns null when there is nothing to show.
 */
export function answerBanner(
  answer: AnswerView | null | undefined,
  now: number,
): {
  kind: 'undo' | 'sending' | 'held' | 'done' | 'stale' | 'failed';
  text: string;
  canUndo: boolean;
} | null {
  if (!answer) return null;
  const left = new Date(answer.deliver_after).getTime() - now;
  switch (answer.status) {
    case 'pending':
      return left > 0 && answer.can_undo
        ? { kind: 'undo', text: `Sending in ${formatCountdown(left)}`, canUndo: true }
        : { kind: 'sending', text: 'Sending…', canUndo: false };
    case 'delivering':
      return { kind: 'sending', text: 'Sending…', canUndo: false };
    case 'dry_run':
      return {
        kind: 'held',
        text: 'Held: the service is in dry-run mode, so nothing was written to the source',
        canUndo: false,
      };
    case 'delivered':
      return { kind: 'done', text: 'Sent', canUndo: false };
    case 'stale':
      return { kind: 'stale', text: 'Changed since you looked. Not sent.', canUndo: false };
    case 'failed':
      return { kind: 'failed', text: answer.error || 'Could not be delivered', canUndo: false };
    default:
      return null;
  }
}

/** Evidence is technical, so the UI only opens http(s) links. */
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Milliseconds until the default fires, or null. */
export function defaultCountdown(
  decision: Pick<DecisionView, 'default'>,
  now: number,
): number | null {
  const d = decision.default;
  if (!d || !d.deadline) return null;
  return Math.max(0, new Date(d.deadline).getTime() - now);
}

export type CardBannerKind = 'undo' | 'sending' | 'held' | 'done' | 'stale' | 'failed';

/**
 * The status line an inbox card should show, for any decision state:
 * the answer banner while answered, the repair lines for the attention
 * queue, nothing for a plain open decision.
 */
export function cardBanner(
  d: Pick<DecisionView, 'status' | 'status_reason' | 'answer' | 'created_at'>,
  now: number,
): { kind: CardBannerKind; text: string } | null {
  const a = answerBanner(d.answer, now);
  if (a) return a;
  switch (d.status) {
    case 'queued':
      return { kind: 'held', text: d.status_reason || 'Queued behind another change' };
    case 'stale':
      return { kind: 'stale', text: d.status_reason || 'Changed since you looked' };
    case 'failed':
      return { kind: 'failed', text: d.status_reason || 'Delivery failed' };
    case 'expired':
      return { kind: 'held', text: 'Agent stopped (the request expired)' };
    case 'resolved_outside':
      return { kind: 'done', text: 'Resolved outside Nod' };
    case 'withdrawn':
      return { kind: 'done', text: 'Withdrawn' };
    default:
      return null;
  }
}

/** The "If you say nothing: …" line for a decision's default. */
export function defaultLine(
  decision: Pick<DecisionView, 'default' | 'options'>,
  now: number,
): string | null {
  const ms = defaultCountdown(decision, now);
  if (ms === null) return null;
  const d = decision.default!;
  const label = decision.options.find((o) => o.id === d.option)?.label ?? d.option;
  return `If you say nothing: ${label}, in ${formatCountdown(ms)}`;
}
