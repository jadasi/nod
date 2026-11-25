/**
 * Settings: this phone, notifications, the RayNeo mirror, and what the
 * server decides.
 *
 * Grouped panels, not one long list: each group is a common region, so the
 * read-only rows (open hours, delivery mode, the undo window) are visibly
 * in the server's half of the screen and never look like broken controls.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openSettings } from 'expo-linking';
import { tokens } from '@nod/design-tokens';
import type { AppSettings } from '@/auth.js';
import { CHANNELS } from '@/lib/notifications.js';
import { isOpenNow } from '@/lib/hours.js';
import { border, space, useColors } from '@/theme.js';
import { useAppStore, useNow, useStatus } from '@/state.js';
import { AppHeader, ScreenHead } from '@/components/appbar';
import { ListGroup, ListRow, SectionHead, SwitchRow } from '@/components/bits';
import { PixelIcon, type IconName } from '@/components/pixel';
import { Segmented, T } from '@/components/ui';

const CHANNEL_ICONS: Record<string, IconName> = {
  urgent: 'alert',
  decisions: 'inbox',
  sending: 'send',
  updates: 'updates',
  problems: 'stale',
};

const RAYNEO_STEPS: string[] = [
  'Install the official RayNeo AI app on this phone.',
  'In that app, allow it to mirror notifications from other apps.',
  'Android → Apps → Nod → Notifications: keep the Urgent channel allowed, at high priority.',
  'Turn on "Mirror decisions to the glasses" above.',
];

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export default function Settings() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = useNow(30_000);
  const { session, settings, setSettings, signOut } = useAppStore();
  const { data: status } = useStatus();
  const [showRayNeo, setShowRayNeo] = useState(false);

  const set = (patch: Partial<AppSettings>): void => {
    void setSettings({ ...settings, ...patch });
  };

  if (!session) return null;
  const open = isOpenNow(now);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader />
      <ScreenHead title="Settings" />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space[4],
          paddingBottom: insets.bottom + space[6],
        }}
      >
        <SectionHead title="This phone" />
        <ListGroup>
          <ListRow
            icon="key"
            label="Paired with nod-core"
            detail={`${session.serverUrl.replace(/^https?:\/\//, '')} · token ends ${session.token.slice(-4)}`}
            value="Connected"
            valueTone="accent"
          />
          <ListRow
            icon="auto"
            label="Theme"
            trailing={
              <Segmented
                label="Theme"
                options={THEMES}
                value={settings.theme}
                onChange={(theme) => set({ theme })}
              />
            }
          />
          <ListRow
            icon="power"
            label="Sign out"
            detail="Clears the token and your cached decisions from this phone."
            onPress={() => void signOut()}
          />
        </ListGroup>

        <SectionHead title="Notifications" meta={open ? 'Now open' : 'Quiet hours'} />
        <ListGroup>
          {CHANNELS.map((c) => (
            <ListRow
              key={c.id}
              icon={CHANNEL_ICONS[c.id] ?? 'updates'}
              label={c.name}
              detail={c.description}
              onPress={() => void openSettings()}
            />
          ))}
          <ListRow
            icon="clock"
            label="Open hours"
            detail="8:00 am – 8:00 pm Phoenix · set on the server"
            value={open ? 'Now open' : 'Quiet'}
            valueTone={open ? 'accent' : 'dim'}
            disabled
          />
        </ListGroup>

        <SectionHead title="Devices & voice" />
        <ListGroup>
          <SwitchRow
            icon="glasses"
            label="Mirror decisions to the glasses"
            detail={
              settings.glassesMirror
                ? 'New decisions reach the lenses within seconds. Answering stays on this phone.'
                : 'New decisions alert on this phone only.'
            }
            value={settings.glassesMirror}
            onChange={(glassesMirror) => set({ glassesMirror })}
          />
          <ListRow
            icon="glasses"
            label="Set up RayNeo mirroring"
            detail={`${RAYNEO_STEPS.length} steps`}
            onPress={() => setShowRayNeo((v) => !v)}
            value={showRayNeo ? 'Hide' : 'Show'}
            valueTone="accent"
          />
          {showRayNeo ? (
            <View
              style={{
                gap: space[3],
                paddingHorizontal: space[4],
                paddingVertical: space[4],
                backgroundColor: colors.surfaceRaised,
              }}
            >
              {RAYNEO_STEPS.map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: space[3] }}>
                  <View
                    style={{
                      width: space[5],
                      height: space[5],
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: border.hairline,
                      borderColor: colors.lineStrong,
                    }}
                  >
                    <T step="label" color={colors.textDim} weight="700">
                      {i + 1}
                    </T>
                  </View>
                  <T step="small" color={colors.textDim} style={{ flex: 1 }}>
                    {s}
                  </T>
                </View>
              ))}
              <T step="small" color={colors.textFaint}>
                The lenses show the title within 48 characters and the question within 120. Nod fits
                them automatically; nothing is cut mid-word.
              </T>
            </View>
          ) : null}
          <ListRow
            icon="call"
            label="Call Me"
            detail={
              open
                ? 'Arrives in a later update. Calls will run 8:00 am – 8:00 pm.'
                : 'Calls are open 8:00 am – 8:00 pm.'
            }
            value="Off"
            disabled
          />
        </ListGroup>

        <SectionHead title="Delivery" meta="Set on the server" />
        <ListGroup>
          <ListRow
            icon="send"
            label="Delivery mode"
            detail="The server's kill switch. Read-only here."
            value={status ? (status.delivery_mode === 'live' ? 'Live' : 'Dry run') : '…'}
            valueTone={status?.delivery_mode === 'dry_run' ? 'amber' : 'accent'}
            disabled
          />
          <ListRow
            icon="undo"
            label="Undo window"
            detail="How long an answer waits before Nod writes it back."
            value={status ? `${status.undo_window_seconds}s` : '…'}
            disabled
          />
        </ListGroup>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            marginTop: space[5],
          }}
        >
          <PixelIcon name="source" size={tokens.icon.sm} color={colors.textFaint} />
          <T step="small" color={colors.textFaint}>
            Nod for Android · phase 1
          </T>
        </View>
      </ScrollView>
    </View>
  );
}
