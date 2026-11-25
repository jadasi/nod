/**
 * PROVISIONAL UI (BYT-753). The Inbox: filter chips (All / Needs you /
 * Attention), the amber attention row, the quiet-hours strip, the offline
 * banner, and the decision cards in the settled order (urgent first, then
 * oldest). Stale & conflicts lives inside Inbox as the Attention filter
 * (decided 2026-11-14).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import type { DecisionView } from '@/api/types.js';
import { quietHoursLine } from '@/lib/hours.js';
import { needsYou, sortInbox } from '@/lib/sort.js';
import { useColors } from '@/theme.js';
import { useAppStore, useDecisions, useNow, useRepair, useStatus } from '@/state.js';
import { AppHeader } from '@/components/appbar';
import { Chip, EmptyState } from '@/components/bits';
import { DecisionCard } from '@/components/decision-card';

type Filter = 'all' | 'needs' | 'attention';

export default function Inbox() {
  const colors = useColors();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const { data: decisions, refetch, isRefetching } = useDecisions();
  const { data: repair } = useRepair();
  const { data: status } = useStatus();
  const live = useAppStore((s) => s.live);

  const inbox = decisions ?? [];
  const attention = repair ?? [];
  const quiet = quietHoursLine(now);

  const visible: DecisionView[] =
    filter === 'attention'
      ? sortInbox(attention)
      : filter === 'needs'
        ? sortInbox(inbox.filter(needsYou))
        : sortInbox(inbox);

  const emptyLine =
    filter === 'attention'
      ? 'Nothing needs repair.'
      : quiet
        ? 'Quiet hours: only urgent decisions alert you. The 8:00 am digest brings the rest.'
        : 'Nothing is waiting. The 8:00 am digest brings whatever comes in overnight.';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader />

      {!live ? (
        <View
          style={{ backgroundColor: colors.redDeep, paddingVertical: 8, paddingHorizontal: 16 }}
        >
          <Text style={{ color: colors.red, fontSize: 13, fontWeight: '600' }}>
            Offline. Showing what you had — answering is off until Nod reconnects.
          </Text>
        </View>
      ) : null}

      {status?.delivery_mode === 'dry_run' ? (
        <View style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
          <Text style={{ color: colors.textDim, fontSize: 12 }}>
            Dry run: answers are held and nothing is written to the source.
          </Text>
        </View>
      ) : null}

      {quiet ? (
        <View
          style={{
            backgroundColor: colors.surfaceRaised,
            paddingVertical: 8,
            paddingHorizontal: 16,
          }}
        >
          <Text style={{ color: colors.textDim, fontSize: 13 }}>{quiet}</Text>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Needs you" selected={filter === 'needs'} onPress={() => setFilter('needs')} />
        {attention.length > 0 ? (
          <Chip
            label={`Attention · ${attention.length}`}
            tone="attention"
            selected={filter === 'attention'}
            onPress={() => setFilter('attention')}
          />
        ) : null}
      </View>

      {attention.length > 0 && filter !== 'attention' ? (
        <Pressable
          onPress={() => setFilter('attention')}
          accessibilityRole="button"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: 16,
            marginBottom: 8,
            backgroundColor: colors.amberDeep,
            borderLeftWidth: 3,
            borderLeftColor: colors.amber,
            borderRadius: 2,
            paddingVertical: 12,
            paddingHorizontal: 14,
          }}
        >
          <Text style={{ color: colors.amber, fontSize: 14, fontWeight: '600', flex: 1 }}>
            {`${attention.length} need attention`}
          </Text>
          <Text style={{ color: colors.amber, fontSize: 13 }}>Review ›</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.accentInk}
          />
        }
        ListEmptyComponent={<EmptyState line={emptyLine} />}
        renderItem={({ item }) => (
          <DecisionCard d={item} now={now} onPress={() => router.push(`/decision/${item.id}`)} />
        )}
      />
    </View>
  );
}
