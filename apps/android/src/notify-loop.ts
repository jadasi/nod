/**
 * The feed → plan loop: whenever the inbox or the updates list changes (SSE
 * events, the 30 s refetch, a foreground resync) the notification plans are
 * re-evaluated and posted. The plans themselves are pure and unit tested
 * (src/lib/notifications.ts); this is only the trigger that runs them.
 */
import { useEffect } from 'react';
import { syncNotifications } from '@/notify.js';
import { useAppStore, useDecisions, useUpdates } from '@/state.js';

export function useNotifyLoop(): void {
  const glassesMirror = useAppStore((s) => s.settings.glassesMirror);
  const { data: decisions } = useDecisions();
  const { data: updates } = useUpdates();

  useEffect(() => {
    if (!decisions || !updates) return; // first fetches still in flight
    void syncNotifications(decisions, updates, { now: Date.now(), glassesMirror });
  }, [decisions, updates, glassesMirror]);
}
