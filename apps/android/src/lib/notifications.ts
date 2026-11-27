/**
 * Notification plans for the five Android channels, per
 * docs/design/mobile/README.md ("Notifications"). Pure data building — the
 * thin wrapper that talks to expo-notifications lives in `src/notify.ts`.
 *
 * Phase 1 rules (cooldown batching arrives with the core policy loop):
 * - urgent decisions alert any hour (settled);
 * - normal decisions alert in open hours, otherwise they wait for the 8am
 *   digest (settled);
 * - one-tap answers for internal decisions: top 2 options (recommended
 *   first) plus Open (decided 2026-11-14);
 * - external provenance never gets an inline answer: Review in Nod only
 *   (settled);
 * - with the RayNeo glasses mirror on, a new decision posts a
 *   high-priority notification — the official RayNeo AI app mirrors it to
 *   the lenses — with title <= 48 and question <= 120 characters.
 */
import type { DecisionView, UpdateRow } from '@/api/types.js';
import { answerBanner, BUDGET, fitBudget } from './format.js';
import { isOpenNow } from './hours.js';

// The glance budget and the fit function live in format.ts so the undo
// record (lib/undo.ts) can share them without a cycle.
export { BUDGET, fitBudget } from './format.js';

export type ChannelId = 'urgent' | 'decisions' | 'sending' | 'updates' | 'problems';

export interface ChannelSpec {
  id: ChannelId;
  name: string;
  importance: 'high' | 'default' | 'low';
  sound: boolean;
  /** Vibration pattern in ms; [] = none. */
  vibration: number[];
  description: string;
}

export const CHANNELS: readonly ChannelSpec[] = [
  {
    id: 'urgent',
    name: 'Urgent',
    importance: 'high',
    sound: true,
    vibration: [200, 100, 200],
    description: 'Urgent decisions: heads-up with sound, any hour.',
  },
  {
    id: 'decisions',
    name: 'Decisions',
    importance: 'default',
    sound: true,
    vibration: [],
    description: 'Everything else that needs an answer, in open hours.',
  },
  {
    id: 'sending',
    name: 'Sending',
    importance: 'low',
    sound: false,
    vibration: [],
    description: 'The undo window: progress and Undo.',
  },
  {
    id: 'updates',
    name: 'Updates & digest',
    importance: 'low',
    sound: false,
    vibration: [],
    description: 'Sweep summaries and the daily digests. Silent.',
  },
  {
    id: 'problems',
    name: 'Delivery problems',
    importance: 'default',
    sound: false,
    vibration: [80],
    description: 'Failed delivery, changed since you looked, agent stopped.',
  },
] as const;

export const CHANNEL_BY_ID: Record<ChannelId, ChannelSpec> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c]),
) as Record<ChannelId, ChannelSpec>;

export interface NotificationAction {
  id: string;
  title: string;
}

export interface NotificationPlan {
  decisionId?: string;
  updateId?: number;
  channelId: ChannelId;
  title: string;
  body: string;
  actions: NotificationAction[];
  /** Carried in the notification payload for deep links and actions. */
  data: Record<string, unknown>;
}

/**
 * The decisions the post loop should plan over: the union of the inbox
 * view and the repair view, one entry per decision. Core moves a decision
 * out of the inbox view and into the repair view exactly when its answer
 * turns stale or failed — the only states that produce problems-channel
 * plans — so a loop that feeds only the inbox view can never reach the
 * Delivery problems channel. The inbox copy wins when a decision appears
 * in both views.
 */
export function mergeNotificationFeed(
  inbox: readonly DecisionView[],
  repair: readonly DecisionView[],
): DecisionView[] {
  const seen = new Set<string>();
  const feed: DecisionView[] = [];
  for (const d of [...inbox, ...repair]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    feed.push(d);
  }
  return feed;
}

export interface NotifyContext {
  now: number;
  /** RayNeo glasses mirror: new decisions post a high-priority notification
   *  that the official RayNeo AI app shows on the lenses. */
  glassesMirror: boolean;
}

/** Options for a decision, recommended first (for the top-2 actions). */
function orderedOptions(d: DecisionView) {
  const rec = d.options.find((o) => o.id === d.recommended);
  const rest = d.options.filter((o) => o.id !== d.recommended);
  return rec ? [rec, ...rest] : [...d.options];
}

/**
 * The notification a decision should show right now, or null for silence.
 * `null` is a real outcome: quiet hours, answered-and-delivered, and so on.
 */
export function planForDecision(d: DecisionView, ctx: NotifyContext): NotificationPlan | null {
  const open = isOpenNow(ctx.now);
  const urgent = d.urgency === 'urgent';

  // A pending answer is always surfaced: the undo clock runs any hour.
  if (d.answer) {
    const banner = answerBanner(d.answer, ctx.now);
    if (banner?.kind === 'undo') {
      const label =
        d.answer.option_id !== null
          ? (d.options.find((o) => o.id === d.answer!.option_id)?.label ?? d.answer.option_id)
          : d.answer.other_text || 'Your answer';
      return {
        decisionId: d.id,
        channelId: 'sending',
        title: fitBudget(d.glance.title, BUDGET.title),
        body: `Sending “${label}” in ${banner.text.replace('Sending in ', '')}`,
        actions: [{ id: 'undo', title: 'Undo' }],
        // The draining meter the design doc promises for this notification
        // needs a progress bar the OS notification API here does not expose;
        // filed as a follow-up (Notifee or a config plugin) rather than
        // shipping a field the poster drops.
        data: { decisionId: d.id, kind: 'sending' },
      };
    }
    if (banner?.kind === 'stale' || banner?.kind === 'failed') {
      if (!open) return null;
      return {
        decisionId: d.id,
        channelId: 'problems',
        title: fitBudget(d.glance.title, BUDGET.title),
        body: banner.text,
        actions: [{ id: 'open', title: 'Open' }],
        data: { decisionId: d.id, kind: 'problem' },
      };
    }
    return null; // sending / delivered / held: the list and detail carry it.
  }

  if (d.status !== 'open' || !d.needs_david) return null;

  if (ctx.glassesMirror) {
    // High-priority so the official RayNeo AI app mirrors it to the lenses,
    // within the glance budget. Answering stays on the phone.
    return {
      decisionId: d.id,
      channelId: 'urgent',
      title: fitBudget(d.glance.title, BUDGET.title),
      body: fitBudget(d.glance.question, BUDGET.question),
      actions: [{ id: 'open', title: 'Open' }],
      data: { decisionId: d.id, kind: 'glasses', onGlasses: true },
    };
  }

  if (urgent) {
    return decisionPlan(d, 'urgent');
  }
  if (!open) return null; // quiet hours: wait for the 8am digest.
  return decisionPlan(d, 'decisions');
}

function decisionPlan(d: DecisionView, channelId: 'urgent' | 'decisions') {
  const external = d.provenance.kind === 'external';
  const actions: NotificationAction[] = [];
  if (!external) {
    // Top 2 options, recommended first; then Open. (Settled 2026-11-14.)
    for (const o of orderedOptions(d).slice(0, 2)) {
      actions.push({ id: `answer:${o.id}`, title: o.label.slice(0, 20) });
    }
  }
  actions.push({ id: 'open', title: external ? 'Review in Nod' : 'Open' });
  return {
    decisionId: d.id,
    channelId,
    title: fitBudget(d.glance.title, BUDGET.title),
    body: external
      ? `${fitBudget(d.glance.question, BUDGET.question)} · Nod never answers this for you`
      : fitBudget(d.glance.question, BUDGET.question),
    actions,
    data: { decisionId: d.id, kind: 'decision', external },
  } satisfies NotificationPlan & { channelId: 'urgent' | 'decisions' };
}

/** A new update row (sweep, digest, agent report): silent, open hours only. */
export function planForUpdate(u: UpdateRow, ctx: NotifyContext): NotificationPlan | null {
  if (!isOpenNow(ctx.now)) return null;
  if (u.kind !== 'notify') return null;
  return {
    updateId: u.id,
    channelId: 'updates',
    title: u.title.slice(0, BUDGET.title + 24),
    body: (u.body ?? '').slice(0, BUDGET.question),
    actions: [],
    data: { updateId: u.id, kind: 'update' },
  };
}
