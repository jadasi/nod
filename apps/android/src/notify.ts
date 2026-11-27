/**
 * Thin wrapper over expo-notifications (SDK 58): the five channels, posting
 * the plans from src/lib/notifications.ts, and routing taps and one-tap
 * actions into the app. All of the *decisions* (which decision posts what,
 * when, and with which actions) live in the pure, unit-tested planFor*
 * functions — this file only talks to the OS.
 *
 * SDK 58 moved several APIs from 53; the ones this file depends on:
 * - channels: setNotificationChannelAsync(id, config)
 * - immediate posts: `trigger: { channelId }` (the channel left the content)
 * - actions: registered per category via setNotificationCategoryAsync and
 *   referenced through content.categoryIdentifier; category identifiers must
 *   not contain ':' or '-'
 * - taps/actions: addNotificationResponseReceivedListener
 */
import { router } from 'expo-router';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { DecisionView, UpdateRow } from '@/api/types.js';
import {
  CHANNELS,
  CHANNEL_BY_ID,
  planForDecision,
  planForUpdate,
  type NotifyContext,
  type NotificationPlan,
} from '@/lib/notifications.js';
import { pendingRecordFromDecision } from '@/lib/undo.js';
import { client, useAppStore } from '@/state.js';

function importanceFor(id: (typeof CHANNELS)[number]['id']): Notifications.AndroidImportance {
  return {
    urgent: Notifications.AndroidImportance.HIGH,
    decisions: Notifications.AndroidImportance.DEFAULT,
    sending: Notifications.AndroidImportance.LOW,
    updates: Notifications.AndroidImportance.LOW,
    problems: Notifications.AndroidImportance.DEFAULT,
  }[id];
}

/** Creates (or updates) the five channels. Android only; idempotent. */
export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const c of CHANNELS) {
    await Notifications.setNotificationChannelAsync(c.id, {
      name: c.name,
      description: c.description,
      importance: importanceFor(c.id),
      vibrationPattern: c.vibration,
      enableVibrate: c.vibration.length > 0,
      sound: c.sound ? 'default' : null,
    });
  }
}

export async function ensurePermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

/**
 * Posts a plan as a notification that is visible right now and returns the
 * notification identifier (used to dismiss it later). Posting with the same
 * identifier replaces the previous notification in place.
 */
export async function postPlan(plan: NotificationPlan): Promise<string> {
  if (Platform.OS !== 'android') return '';
  await ensureChannels();
  const spec = CHANNEL_BY_ID[plan.channelId];
  const ongoing = plan.channelId === 'sending';
  // Stable per decision: a re-post (new state, same decision) replaces the
  // notification in place instead of stacking a second one.
  const identifier = plan.decisionId ?? `update-${plan.updateId}`;
  // Category ids may not contain ':' or '-', so the decision id goes in
  // without its dashes. Action ids keep their 'answer:…' / 'undo' / 'open'
  // form — they are matched in the response handler, not in the id.
  const category =
    plan.actions.length > 0 && plan.decisionId
      ? `decision${plan.decisionId.replace(/-/g, '')}`
      : null;
  if (category) {
    // Re-registering keeps the button set in sync with the current options.
    await Notifications.setNotificationCategoryAsync(
      category,
      plan.actions.map((a) => ({ identifier: a.id, buttonTitle: a.title })),
    );
  }
  return Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: plan.title,
      body: plan.body,
      data: plan.data,
      priority: spec.importance,
      sticky: ongoing,
      autoDismiss: !ongoing,
      categoryIdentifier: category ?? undefined,
    },
    // A null trigger means "immediately"; in SDK 58 the channel rides the
    // trigger, not the content.
    trigger: { channelId: plan.channelId },
  });
}

/**
 * The post loop, given the current inbox and updates: post a decision's plan
 * when its notification-relevant state changes, dismiss it when the plan
 * goes quiet (delivered, withdrawn, …), and post each update row at most
 * once. The *state* is what changes — not every second of the undo
 * countdown, whose body text ticks but whose notification stays put.
 */
interface Posted {
  sig: string;
  identifier: string;
}
const lastPosted = new Map<string, Posted>();
const updatesPosted = new Set<number>();

/** The notification-relevant state of a decision (no per-second fields). */
function decisionSig(d: DecisionView, ctx: NotifyContext): string {
  const a = d.answer;
  return [
    d.status,
    d.urgency,
    d.needs_david ? 1 : 0,
    a ? `${a.status}|${a.can_undo ? 1 : 0}|${a.option_id ?? ''}|${a.other_text ?? ''}` : '',
    ctx.glassesMirror ? 1 : 0,
  ].join('|');
}

export async function syncNotifications(
  decisions: DecisionView[],
  updates: UpdateRow[],
  ctx: NotifyContext,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const d of decisions) {
    const sig = decisionSig(d, ctx);
    const plan = planForDecision(d, ctx);
    if (plan) {
      const prev = lastPosted.get(d.id);
      if (prev && prev.sig === sig) continue;
      lastPosted.set(d.id, { sig, identifier: await postPlan(plan) });
    } else if (lastPosted.has(d.id)) {
      try {
        await Notifications.dismissNotificationAsync(lastPosted.get(d.id)!.identifier);
      } catch {
        // Already gone (swiped, delivered); nothing to clean up.
      }
      lastPosted.delete(d.id);
    }
  }
  for (const u of updates) {
    if (updatesPosted.has(u.id)) continue;
    updatesPosted.add(u.id);
    const plan = planForUpdate(u, ctx);
    if (plan) void postPlan(plan);
  }
}

/**
 * Routes notification interactions into the app: a tap or the Open action
 * lands on the decision detail; one-tap answers answer immediately (the undo
 * window then applies) and persist the pending record; Undo undoes.
 */
let responseListenerSet = false;

export function handleNotificationResponse(): void {
  if (responseListenerSet) return;
  responseListenerSet = true;
  Notifications.addNotificationResponseReceivedListener((resp) => {
    void (async () => {
      const data = (resp.notification.request.content.data ?? {}) as Record<string, unknown>;
      const decisionId = typeof data.decisionId === 'string' ? data.decisionId : null;
      const store = useAppStore.getState();
      if (decisionId) {
        const c = client();
        if (c) {
          try {
            if (resp.actionIdentifier === 'undo') {
              await c.undo(decisionId);
              await store.forgetAnswer(decisionId);
            } else if (resp.actionIdentifier.startsWith('answer:')) {
              const optionId = resp.actionIdentifier.slice('answer:'.length);
              const d = await c.answer(decisionId, { optionId });
              const rec = pendingRecordFromDecision(d);
              if (rec) await store.rememberAnswer(rec);
            }
          } catch {
            // The detail screen shows the live state when it opens.
          }
        }
        router.replace(`/decision/${decisionId}`);
      } else if (typeof data.updateId === 'number') {
        router.replace('/(tabs)/updates');
      }
    })();
  });
}
