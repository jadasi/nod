/**
 * The Updates tab: what the system did, newest first.
 *
 * The latest sweep summary sits on top as a plain panel — it is the one
 * thing worth reading in full — and the history below is a flat list of
 * rows rather than cards. Nothing here needs David, so nothing here gets
 * brackets or green.
 */
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@nod/design-tokens';
import type { UpdateRow } from '@/api/types.js';
import { formatAge } from '@/lib/format.js';
import { border, space, useColors } from '@/theme.js';
import { useNow, useUpdates } from '@/state.js';
import { AppHeader, ScreenHead } from '@/components/appbar';
import { EmptyState } from '@/components/bits';
import { PixelIcon, type IconName } from '@/components/pixel';
import { Label, Panel, Skeleton, T } from '@/components/ui';

/** Each row says what kind of thing happened before it says anything else. */
function rowIcon(u: UpdateRow): IconName {
  if (u.level === 'error') return 'close';
  if (u.level === 'warn') return 'alert';
  if (u.kind === 'progress') return 'clock';
  return 'check';
}

function Row({ item, now }: { item: UpdateRow; now: number }) {
  const colors = useColors();
  const tint =
    item.level === 'error' ? colors.red : item.level === 'warn' ? colors.amber : colors.textDim;
  const meta = [
    item.system,
    item.project,
    `${formatAge(Math.max(0, (now - new Date(item.created_at).getTime()) / 1000))} ago`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space[3],
        paddingVertical: space[4],
        borderBottomWidth: border.hairline,
        borderBottomColor: colors.line,
      }}
    >
      <PixelIcon name={rowIcon(item)} size={tokens.icon.md} color={tint} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: space[1] }}>
        <T step="body" weight="700">
          {item.title}
        </T>
        {item.body ? (
          <T step="body" color={colors.textDim} numberOfLines={3}>
            {item.body}
          </T>
        ) : null}
        <T step="small" color={colors.textFaint}>
          {meta}
        </T>
      </View>
    </View>
  );
}

export default function Updates() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = useNow(10_000);
  const { data: updates, isPending } = useUpdates();

  const rows = updates ?? [];
  const [summary, ...history] = rows;
  const showSummary = summary?.kind === 'notify' && summary.level === 'info';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader />
      <ScreenHead title="Updates" meta={rows.length > 0 ? `${rows.length} today` : undefined} />

      <FlatList
        data={isPending ? [] : showSummary ? history : rows}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={{
          paddingHorizontal: space[4],
          paddingBottom: insets.bottom + space[5],
          flexGrow: 1,
        }}
        ListHeaderComponent={
          showSummary && summary ? (
            <View style={{ paddingTop: space[4], paddingBottom: space[2] }}>
              <Panel>
                <View style={{ padding: space[4], gap: space[2] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <PixelIcon name="updates" size={tokens.icon.sm + 4} color={colors.textDim} />
                    <Label>{`${summary.system} · latest`}</Label>
                  </View>
                  <T step="body" weight="700">
                    {summary.title}
                  </T>
                  {summary.body ? (
                    <T step="body" color={colors.textDim}>
                      {summary.body}
                    </T>
                  ) : null}
                </View>
              </Panel>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          isPending ? (
            <View style={{ paddingTop: space[4], gap: space[4] }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ gap: space[2] }}>
                  <Skeleton height={20} width="70%" />
                  <Skeleton height={16} width="45%" />
                </View>
              ))}
            </View>
          ) : (
            <View style={{ paddingTop: space[5] }}>
              <EmptyState
                heading="Nothing yet"
                line="Delivered answers, defaults that ran and agent reports land here."
              />
            </View>
          )
        }
        renderItem={({ item }) => <Row item={item} now={now} />}
      />
    </View>
  );
}
