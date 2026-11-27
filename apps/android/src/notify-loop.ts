/**
 * The feed → plan loop: whenever the inbox, the attention queue, or the
 * updates list changes (SSE events, the 30 s refetch, a foreground resync)
 * the notification plans are re-evaluated and posted. The plans themselves
 * are pure and unit tested (src/lib/notifications.ts); this is only the
 * trigger that runs them.
 *
 * The feed is the union of the inbox view and the repair view. Core moves
 * a decision into the repair view exactly when its answer turns stale or
 * failed — the only states that post on the Delivery problems channel — so
 * a loop fed only from the inbox view can never post problems plans.
 */
import { useEffect } from 'react';
import { mergeNotificationFeed } from '@/lib/notifications.js';
import { syncNotifications } from '@/notify.js';
import { useAppStore, useDecisions, useRepair, useUpdates } from '@/state.js';

export function useNotifyLoop(): void {
  const glassesMirror = useAppStore((s) => s.settings.glassesMirror);
  const { data: decisions } = useDecisions();
  const { data: repair } = useRepair();
  const { data: updates } = useUpdates();

  useEffect(() => {
    if (!decisions || !updates || !repair) return; // first fetches still in flight
    void syncNotifications(mergeNotificationFeed(decisions, repair), updates, {
      now: Date.now(),
      glassesMirror,
    });
  }, [decisions, repair, updates, glassesMirror]);
}
