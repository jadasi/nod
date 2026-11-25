/**
 * App state: the session and settings (encrypted storage via src/auth.ts),
 * the live flag for the SSE stream, the persisted undo-window records, and
 * the react-query wiring to nod-core. The undo window itself is
 * server-authoritative (core holds the answer until `deliver_after`); the
 * phone only mirrors it — see src/lib/undo.ts for the model.
 */
import { AppState } from 'react-native';
import { QueryClient, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { create } from 'zustand';
import { NodClient } from '@/api/client.js';
import type { DecisionView, StatusView, UpdateRow } from '@/api/types.js';
import {
  clearSession,
  defaultSettings,
  loadPendingAnswers,
  loadSession,
  loadSettings,
  savePendingAnswers,
  saveSession,
  saveSettings,
  type AppSettings,
  type Session,
} from '@/auth.js';
import {
  pendingRecordFromDecision,
  reconcileRecords,
  removeRecord,
  stillUndoable,
  upsertRecord,
  type PendingAnswerRecord,
} from '@/lib/undo.js';
import { useEffect, useState } from 'react';

interface AppStore {
  booted: boolean;
  session: Session | null;
  settings: AppSettings;
  /** True once the SSE stream has connected; false while it is down. */
  live: boolean;
  /** Pending answers restored from encrypted storage (survives process death). */
  pending: PendingAnswerRecord[];
  boot(): Promise<void>;
  signIn(serverUrl: string, token: string): Promise<void>;
  signOut(): Promise<void>;
  setSettings(settings: AppSettings): Promise<void>;
  setLive(live: boolean): void;
  setPending(records: PendingAnswerRecord[]): Promise<void>;
  rememberAnswer(record: PendingAnswerRecord): Promise<void>;
  forgetAnswer(decisionId: string): Promise<void>;
}

export const useAppStore = create<AppStore>()((set, get) => ({
  booted: false,
  session: null,
  settings: defaultSettings,
  live: false,
  pending: [],

  async boot() {
    const [session, settings, pending] = await Promise.all([
      loadSession(),
      loadSettings(),
      loadPendingAnswers(),
    ]);
    set({ session, settings, pending, booted: true });
  },

  async signIn(serverUrl, token) {
    // Verify before storing: a token is only worth the storage it costs.
    await new NodClient({ baseUrl: serverUrl, token }).status();
    const session: Session = { serverUrl, token };
    await saveSession(session);
    set({ session });
  },

  async signOut() {
    await Promise.all([clearSession(), savePendingAnswers([])]);
    set({ session: null, pending: [], live: false });
  },

  async setSettings(settings) {
    await saveSettings(settings);
    set({ settings });
  },

  setLive: (live) => set({ live }),

  async setPending(records) {
    await savePendingAnswers(records);
    set({ pending: records });
  },

  async rememberAnswer(record) {
    await get().setPending(upsertRecord(get().pending, record));
  },

  async forgetAnswer(decisionId) {
    await get().setPending(removeRecord(get().pending, decisionId));
  },
}));

/** A client for the current session, or null when signed out. */
export function client(): NodClient | null {
  const s = useAppStore.getState().session;
  if (!s) return null;
  return new NodClient({ baseUrl: s.serverUrl, token: s.token });
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 15_000, refetchOnWindowFocus: false } },
});

/** The inbox: decisions that need an answer, plus answered ones in the undo window. */
export function useDecisions(): UseQueryResult<DecisionView[]> {
  return useQuery({
    queryKey: ['decisions', 'inbox'],
    queryFn: () => client()!.decisions('inbox'),
    refetchInterval: 30_000,
  });
}

/** The attention queue (HANDOFF 5.9): repair items that need a different action. */
export function useRepair(): UseQueryResult<DecisionView[]> {
  return useQuery({
    queryKey: ['decisions', 'repair'],
    queryFn: () => client()!.decisions('repair'),
    refetchInterval: 30_000,
  });
}

export function useDecision(id: string): UseQueryResult<DecisionView> {
  return useQuery({
    queryKey: ['decision', id],
    queryFn: () => client()!.decision(id),
    refetchInterval: 10_000,
  });
}

export function useUpdates(): UseQueryResult<UpdateRow[]> {
  return useQuery({
    queryKey: ['updates'],
    queryFn: () => client()!.updates(),
    refetchInterval: 60_000,
  });
}

export function useStatus(): UseQueryResult<StatusView> {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => client()!.status(),
    refetchInterval: 5 * 60_000,
  });
}

/** A ticking clock for countdowns (1 s). The times come from core; only the
 *  "now" is the phone's, so a slow phone clock reads as a shorter window,
 *  never a longer one — the server re-checks the source before delivering. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Follow the core event stream while signed in. Marks the app LIVE on the
 * first event and refetches the affected lists; a resync (a gap) refetches
 * everything. A bad token signs the user out.
 */
export function useEventFeed(): void {
  const session = useAppStore((s) => s.session);
  const setLive = useAppStore((s) => s.setLive);
  const qc = useQueryClient();

  useEffect(() => {
    if (!session) return;
    const c = new NodClient({ baseUrl: session.serverUrl, token: session.token });
    const close = c.openEvents((e) => {
      setLive(true);
      if (e.type === 'decision') {
        void qc.invalidateQueries({ queryKey: ['decisions'] });
        void qc.invalidateQueries({ queryKey: ['decision', e.id] });
      } else if (e.type === 'update') {
        void qc.invalidateQueries({ queryKey: ['updates'] });
      } else if (e.type === 'resync') {
        void qc.invalidateQueries();
      }
    });
    return () => {
      close();
      setLive(false);
    };
  }, [session, qc, setLive]);
}

/**
 * Reconcile the persisted pending answers after a launch or foreground:
 * records whose window has ended are re-fetched from core; the live state
 * (delivered, stale, failed, undone) replaces the record, so the undo bar
 * reappears exactly where it left off and never one window long.
 */
export async function reconcilePending(): Promise<void> {
  const store = useAppStore.getState();
  const c = client();
  if (!c || store.pending.length === 0) return;
  const now = Date.now();
  const { keep, toClear } = reconcileRecords(store.pending, now);
  let records = keep;
  for (const id of toClear) {
    const stale = store.pending.find((r) => r.decisionId === id);
    try {
      const d = await c.decision(id);
      if (stillUndoable(d, Date.now())) {
        const rec = pendingRecordFromDecision(d);
        if (rec) records = upsertRecord(records, rec);
      }
    } catch {
      // Offline: keep the record as-is; the next foreground retries.
      if (stale) records = upsertRecord(records, stale);
    }
  }
  if (records.length !== store.pending.length || records.some((r) => !store.pending.includes(r))) {
    await store.setPending(records);
  }
}

/** Re-fetches and reconciles on foreground, so the undo bar survives background. */
export function useForegroundRefetch(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void qc.invalidateQueries();
        void reconcilePending();
      }
    });
    return () => sub.remove();
  }, [qc]);
}
