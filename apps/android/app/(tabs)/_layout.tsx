/**
 * Three tabs — Inbox · Updates · Settings — with a custom bar, because the
 * Inbox tab carries two badges: a green count of decisions that need David
 * and, next to it, an amber count of items that need repair. The amber
 * count stays visible from every tab, so a failed delivery is never hidden
 * behind a filter.
 */
import { Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@nod/design-tokens';
import { needsYou } from '@/lib/sort.js';
import { border, space, useColors } from '@/theme.js';
import { useDecisions, useRepair } from '@/state.js';
import { PixelIcon, type IconName } from '@/components/pixel';
import { T } from '@/components/ui';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'inbox', label: 'Inbox', icon: 'inbox' },
  { name: 'updates', label: 'Updates', icon: 'updates' },
  { name: 'settings', label: 'Settings', icon: 'gear' },
];

function Badge({ count, tone }: { count: number; tone: 'accent' | 'amber' }) {
  const colors = useColors();
  if (count <= 0) return null;
  return (
    <View
      style={{
        minWidth: space[4],
        paddingHorizontal: space[1],
        backgroundColor: tone === 'accent' ? colors.accent : colors.amber,
        alignItems: 'center',
      }}
    >
      <T step="label" color={tone === 'accent' ? colors.onAccent : colors.bg} weight="700">
        {count}
      </T>
    </View>
  );
}

/** Only the slice of the navigator's tab-bar props this bar actually uses. */
interface TabBarProps {
  state: { index: number };
  navigation: { navigate: (name: string) => void };
}

export function TabBar({ state, navigation }: TabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: decisions } = useDecisions();
  const { data: repair } = useRepair();
  const waiting = (decisions ?? []).filter(needsYou).length;
  const attention = (repair ?? []).length;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.bg,
        borderTopWidth: border.hairline,
        borderTopColor: colors.line,
        paddingBottom: insets.bottom,
      }}
    >
      {TABS.map((tab, i) => {
        const focused = state.index === i;
        const tint = focused ? colors.text : colors.textDim;
        const badges = tab.name === 'inbox';
        return (
          <Pressable
            key={tab.name}
            onPress={() => navigation.navigate(tab.name)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              badges && (waiting > 0 || attention > 0)
                ? `${tab.label}, ${waiting} need you, ${attention} need attention`
                : tab.label
            }
            style={{
              flex: 1,
              alignItems: 'center',
              gap: space[2],
              paddingTop: space[3],
              paddingBottom: space[3],
              borderTopWidth: 2,
              borderTopColor: focused ? colors.text : 'transparent',
              marginTop: -border.hairline,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
              <PixelIcon name={tab.icon} size={tokens.icon.md} color={tint} />
              {badges ? (
                <>
                  <Badge count={waiting} tone="accent" />
                  <Badge count={attention} tone="amber" />
                </>
              ) : null}
            </View>
            <T step="label" color={tint} weight={focused ? '700' : '600'}>
              {tab.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
