/**
 * PROVISIONAL UI (BYT-753). The Updates tab: the history list — delivered
 * answers, defaults that ran, scheduled work, agent reports, the digests —
 * with source · time on each row.
 */
import { FlatList, Text, View } from 'react-native';
import { formatAge } from '@/lib/format.js';
import { useColors } from '@/theme.js';
import { useNow, useUpdates } from '@/state.js';
import { AppHeader } from '@/components/appbar';
import { Tag } from '@/components/bits';

export default function Updates() {
  const colors = useColors();
  const now = useNow(10_000);
  const { data: updates } = useUpdates();

  const rows = updates ?? [];
  const age = (iso: string): string =>
    formatAge(Math.max(0, (now - new Date(iso).getTime()) / 1000));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader />
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Updates</Text>
        <Text style={{ color: colors.textDim, fontSize: 13 }}>
          What the system has been doing, newest first.
        </Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={
          <Text style={{ color: colors.textDim, fontSize: 14 }}>Nothing yet.</Text>
        }
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.line,
              borderWidth: 1,
              borderLeftWidth: 3,
              borderLeftColor:
                item.level === 'error'
                  ? colors.red
                  : item.level === 'warn'
                    ? colors.amber
                    : colors.line,
              borderRadius: 2,
              padding: 14,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Tag tone={item.kind === 'notify' ? 'accent' : 'dim'}>{item.kind}</Tag>
              {item.project ? <Tag tone="dim">{item.project}</Tag> : null}
              <Tag tone="dim">{item.system}</Tag>
            </View>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
              {item.title}
            </Text>
            {item.body ? (
              <Text style={{ color: colors.textDim, fontSize: 14 }} numberOfLines={4}>
                {item.body}
              </Text>
            ) : null}
            <Text
              style={{ color: colors.textFaint, fontSize: 12 }}
            >{`updated ${age(item.created_at)} ago`}</Text>
          </View>
        )}
      />
    </View>
  );
}
