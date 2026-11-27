/**
 * The Inbox.
 *
 * One place for everything that needs David: the decisions in the settled
 * order (urgent first, then oldest), and the repair queue as an Attention
 * filter rather than a second tab (decided 2026-11-14).
 *
 * The conditions of the whole screen — offline, quiet hours, dry run — sit
 * as strips above the list, so they are read before anything is answered
 * and they do not scroll away.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DecisionView } from '@/api/types.js';
import { answerBanner } from '@/lib/format.js';
import { quietHoursLine } from '@/lib/hours.js';
import { needsYou, sortInbox } from '@/lib/sort.js';
import { space, useColors } from '@/theme.js';
import { client, useAppStore, useDecisions, useNow, useRepair, useStatus } from '@/state.js';
import { AppHeader, ScreenHead } from '@/components/appbar';
import { EmptyState } from '@/components/bits';
import { DecisionCard, type RepairActions } from '@/components/decision-card';
import { PixelIcon } from '@/components/pixel';
import { Chip, NoticeStrip, Panel, Skeleton, T } from '@/components/ui';
import { Pressable } from 'react-native';

type Filter = 'all' | 'needs' | 'attention';

/** The amber row that keeps a failed delivery visible behind any filter. */
function AttentionRow({ items, onReview }: { items: DecisionView[]; onReview: () => void }) {
  const colors = useColors();
  // The summary names the kinds of problem, not each one's full sentence:
  // the row is a signpost, and the cards behind it carry the detail.
  const KIND: Record<string, string> = {
    stale: 'Changed since you looked',
    failed: 'Delivery failed',
    queued: 'Queued',
    expired: 'Agent stopped',
    resolved_outside: 'Resolved outside Nod',
  };
  const reasons = [...new Set(items.map((d) => KIND[d.status] ?? d.status))].slice(0, 3);
  return (
    <Pressable
      onPress={onReview}
      accessibilityRole="button"
      accessibilityLabel={`${items.length} need attention. Review.`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[4],
        backgroundColor: pressed ? colors.surfaceRaised : colors.amberDeep,
        borderWidth: 1,
        borderColor: colors.amber,
      })}
    >
      <PixelIcon name="stale" size={24} color={colors.amber} />
      <View style={{ flex: 1, gap: space[1] }}>
        <T step="title" color={colors.amber}>
          {`${items.length} need attention`}
        </T>
        <T step="small" color={colors.amber} numberOfLines={2}>
          {reasons.join(' · ')}
        </T>
      </View>
      <T step="label" color={colors.amber} weight="700">
        Review ›
      </T>
    </Pressable>
  );
}

/** The loading list: three card-shaped skeletons, so the page keeps its shape. */
function LoadingList() {
  return (
    <View style={{ gap: space[3] }}>
      {[0, 1, 2].map((i) => (
        <Panel key={i}>
          <View style={{ padding: space[4], gap: space[3] }}>
            <Skeleton height={20} width="40%" />
            <Skeleton height={24} width="80%" />
            <Skeleton height={16} />
            <Skeleton height={16} width="60%" />
          </View>
        </Panel>
      ))}
    </View>
  );
}

export default function Inbox() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const { data: decisions, refetch, isRefetching, isPending } = useDecisions();
  const { data: repair, refetch: refetchRepair } = useRepair();
  const { data: status } = useStatus();
  const live = useAppStore((s) => s.live);

  const inbox = decisions ?? [];
  const attention = repair ?? [];
  const quiet = quietHoursLine(now);
  const waiting = inbox.filter(needsYou).length;
  const sending = inbox.filter((d) => answerBanner(d.answer, now)?.canUndo).length;

  const visible: DecisionView[] =
    filter === 'attention'
      ? sortInbox(attention)
      : filter === 'needs'
        ? sortInbox(inbox.filter(needsYou))
        : sortInbox(inbox);

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    if (!client()) return;
    setBusy(true);
    try {
      await fn();
      await Promise.all([refetch(), refetchRepair()]);
    } catch {
      // The refetch shows whatever the server decided.
    } finally {
      setBusy(false);
    }
  };

  /** Repair actions follow the problem, as in the design doc's table. */
  const repairActions = (d: DecisionView): RepairActions | undefined => {
    if (filter !== 'attention') return undefined;
    const c = () => client()!;
    switch (d.status) {
      case 'stale':
        return {
          onReask: () => void act(() => c().reask(d.id)),
          onWithdraw: () => void act(() => c().withdraw(d.id)),
        };
      case 'failed':
        return {
          onRetry: () => void act(() => c().reask(d.id)),
          onRefresh: () => void act(() => c().refresh(d.id)),
        };
      case 'queued':
        return {};
      case 'expired':
        return {
          onWithdraw: () => void act(() => c().withdraw(d.id)),
          onReask: () => void act(() => c().reask(d.id)),
        };
      default:
        return {};
    }
  };

  const meta =
    filter === 'attention'
      ? `Showing attention · ${attention.length}`
      : sending > 0
        ? `${waiting} need you · ${sending} sending`
        : `${waiting} need you`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader />

      {!live ? (
        <NoticeStrip
          tone="offline"
          title="Offline. Showing what you had."
          detail="Answers need a connection: the undo clock and the source check run on the server."
        />
      ) : null}

      {status?.delivery_mode === 'dry_run' ? (
        <NoticeStrip
          tone="dryRun"
          title="Dry run"
          detail="Answers are held. Nothing is written to the source."
        />
      ) : null}

      {quiet ? <NoticeStrip tone="quiet" title={quiet} /> : null}

      <ScreenHead title="Inbox" meta={meta} />

      <View
        style={{
          flexDirection: 'row',
          gap: space[2],
          paddingHorizontal: space[4],
          paddingVertical: space[3],
        }}
      >
        <Chip
          label="All"
          count={inbox.length}
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label="Needs you"
          count={waiting}
          selected={filter === 'needs'}
          onPress={() => setFilter('needs')}
        />
        {attention.length > 0 ? (
          <Chip
            label="Attention"
            count={attention.length}
            icon="stale"
            tone="attention"
            selected={filter === 'attention'}
            onPress={() => setFilter('attention')}
          />
        ) : null}
      </View>

      <FlatList
        data={isPending ? [] : visible}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{
          paddingHorizontal: space[4],
          paddingBottom: insets.bottom + space[5],
          gap: space[3],
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.accentInk}
            colors={[colors.accentInk]}
            progressBackgroundColor={colors.surface}
          />
        }
        ListHeaderComponent={
          attention.length > 0 && filter !== 'attention' ? (
            <View style={{ marginBottom: space[1] }}>
              <AttentionRow items={attention} onReview={() => setFilter('attention')} />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          isPending ? (
            <LoadingList />
          ) : filter === 'attention' ? (
            <EmptyState
              heading="Nothing to repair"
              line="Every answer reached its source. Problems show up here when one does not."
            />
          ) : (
            <EmptyState
              heading="All clear"
              line={
                quiet
                  ? 'Nothing needs you. Anything that arrives tonight waits for the 8:00 am digest.'
                  : 'Nothing needs you. New decisions arrive here and on your notifications.'
              }
              action={{
                label: "See today's updates",
                icon: 'updates',
                onPress: () => router.push('/(tabs)/updates'),
              }}
            />
          )
        }
        renderItem={({ item }) => (
          <DecisionCard
            d={item}
            now={now}
            offline={!live}
            busy={busy}
            repair={repairActions(item)}
            onPress={() => router.push(`/decision/${item.id}`)}
          />
        )}
      />
    </View>
  );
}
