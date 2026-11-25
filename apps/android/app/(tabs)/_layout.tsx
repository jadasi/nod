/**
 * PROVISIONAL UI (BYT-753). Three tabs — Inbox · Updates · Settings — with
 * pixel icons; the Inbox tab carries the "needs you" badge (the amber
 * attention count shows in the Inbox's attention row until the design pass).
 */
import { Tabs } from 'expo-router';
import { useDecisions } from '@/state.js';
import { needsYou } from '@/lib/sort.js';
import { useColors } from '@/theme.js';
import { PixelIcon } from '@/components/pixel';
import type { IconName } from '@nod/design-tokens';

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <PixelIcon name={name} cell={2} color={color} />;
}

export default function TabsLayout() {
  const colors = useColors();
  const decisions = useDecisions();
  const count = decisions.data?.filter(needsYou).length ?? 0;
  // The router hands back its internal color type (string | object | null);
  // the pixel icons only take a string.
  const iconColor = (color: unknown): string =>
    typeof color === 'string' ? color : colors.textDim;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentInk,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => <TabIcon name="inbox" color={iconColor(color)} />,
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.onAccent },
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: 'Updates',
          tabBarIcon: ({ color }) => <TabIcon name="updates" color={iconColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon name="gear" color={iconColor(color)} />,
        }}
      />
    </Tabs>
  );
}
