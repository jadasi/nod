/**
 * PROVISIONAL UI (BYT-753). Settings: this phone (server, token, theme,
 * sign out), the five notification channels, the RayNeo setup section, and
 * the read-only delivery settings that live on the server.
 */
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { openSettings } from 'expo-linking';
import { CHANNELS } from '@/lib/notifications.js';
import { callAvailability } from '@/lib/hours.js';
import { useColors } from '@/theme.js';
import { useNow, useAppStore, useStatus } from '@/state.js';
import { AppHeader } from '@/components/appbar';
import { Chip, ListRow, SectionHead } from '@/components/bits';
import type { AppSettings } from '@/auth.js';

const RAYNEO_STEPS: string[] = [
  'Install the official RayNeo AI app on this phone.',
  'In that app, allow it to mirror notifications from other apps.',
  'Android → Apps → Nod → Notifications: keep the Urgent channel allowed (high priority).',
  'Turn on "Mirror decisions to the glasses" above. New decisions then reach the lenses within seconds; answering stays on this phone.',
];

export default function Settings() {
  const colors = useColors();
  const now = useNow(30_000);
  const { session, settings, setSettings, signOut } = useAppStore();
  const { data: status } = useStatus();
  const [showRayNeo, setShowRayNeo] = useState(false);

  const set = (patch: Partial<AppSettings>): void => {
    void setSettings({ ...settings, ...patch });
  };

  if (!session) return null;
  const tokenTail = `····${session.token.slice(-4)}`;
  const callNote = callAvailability(now);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, paddingBottom: 32 }}>
      <AppHeader />
      <View style={{ marginTop: 8 }}>
        <SectionHead title="This phone" />
        <ListRow label="Server" value={session.serverUrl} note="nod-core" />
        <ListRow label="Device token" value={tokenTail} note="in encrypted storage" />
        <ListRow
          label="Theme"
          trailing={
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['system', 'light', 'dark'] as const).map((m) => (
                <Chip
                  key={m}
                  label={m.charAt(0).toUpperCase() + m.slice(1)}
                  selected={settings.theme === m}
                  onPress={() => set({ theme: m })}
                />
              ))}
            </View>
          }
        />
        <ListRow
          label="Sign out"
          onPress={() => {
            void signOut();
          }}
          trailing={
            <Text style={{ color: colors.red, fontSize: 14, fontWeight: '600' }}>Sign out</Text>
          }
        />

        <SectionHead title="Notifications" />
        {CHANNELS.map((c) => (
          <ListRow
            key={c.id}
            label={c.name}
            note={c.description}
            onPress={() => {
              // The five channels live in one system screen per app.
              void openSettings();
            }}
            trailing={<Text style={{ color: colors.textDim, fontSize: 13 }}>›</Text>}
          />
        ))}
        <ListRow
          label="Open hours"
          value="8:00 am – 8:00 pm Phoenix"
          note="set on server"
          disabled
        />

        <SectionHead title="Devices & voice" />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>RayNeo glasses</Text>
            <Text style={{ color: colors.textDim, fontSize: 12 }}>
              {settings.glassesMirror
                ? 'Mirroring new decisions to the lenses'
                : 'New decisions alert on this phone only'}
            </Text>
          </View>
          <Switch
            value={settings.glassesMirror}
            onValueChange={(v) => set({ glassesMirror: v })}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.surface}
          />
        </View>
        <ListRow
          label="Set up RayNeo mirroring"
          note={RAYNEO_STEPS.length === 4 ? '4 steps' : undefined}
          onPress={() => setShowRayNeo((v) => !v)}
          trailing={
            <Text style={{ color: colors.accentInk, fontSize: 13, fontWeight: '600' }}>
              {showRayNeo ? 'Hide' : 'Show'}
            </Text>
          }
        />
        {showRayNeo ? (
          <View
            style={{
              backgroundColor: colors.surface,
              paddingHorizontal: 16,
              paddingVertical: 12,
              gap: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}
          >
            {RAYNEO_STEPS.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ color: colors.accentInk, fontSize: 13, fontWeight: '700' }}>
                  {`${i + 1}.`}
                </Text>
                <Text style={{ color: colors.textDim, fontSize: 13, flex: 1 }}>{s}</Text>
              </View>
            ))}
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>
              The glasses show title and question within the glance budget (48 / 120 characters);
              Nod fits them automatically.
            </Text>
          </View>
        ) : null}
        <ListRow
          label="Call Me"
          value="arrives in a later update"
          note={callNote ?? 'calls are open 8:00 am – 8:00 pm'}
          disabled
        />

        <SectionHead title="Delivery" />
        <ListRow
          label="Delivery mode"
          value={status ? (status.delivery_mode === 'live' ? 'Live' : 'Dry run') : '…'}
          note="mirrors the server"
          disabled
        />
        <ListRow
          label="Undo window"
          value={status ? `${status.undo_window_seconds}s` : '…'}
          note="set on server"
          disabled
        />
        <Text
          style={{ color: colors.textFaint, fontSize: 12, marginTop: 16, paddingHorizontal: 4 }}
        >
          Nod for Android · phase 1
        </Text>
      </View>
    </View>
  );
}
