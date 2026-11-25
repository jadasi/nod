/**
 * Root layout: boots the encrypted session, keeps the native splash up until
 * then, and provides the query client. All UI below this file is
 * PROVISIONAL (functional placeholder, owned by Designer — BYT-753).
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useAppStore, queryClient, useEventFeed, useForegroundRefetch } from '@/state.js';
import { ensureChannels, ensurePermission, handleNotificationResponse } from '@/notify.js';
import { useNotifyLoop } from '@/notify-loop.js';
import { useColors, useThemeName } from '@/theme.js';
import { StatusBar } from 'expo-status-bar';

void SplashScreen.preventAutoHideAsync();

/** Hooks that only run while signed in: the SSE feed, the foreground
 *  reconcile, and the notification post loop. */
function SessionHooks() {
  useEventFeed();
  useForegroundRefetch();
  useNotifyLoop();
  return null;
}

export default function RootLayout() {
  const booted = useAppStore((s) => s.booted);
  const session = useAppStore((s) => s.session);
  const theme = useThemeName();
  const colors = useColors();

  useEffect(() => {
    void useAppStore
      .getState()
      .boot()
      .then(() => SplashScreen.hideAsync());
  }, []);

  useEffect(() => {
    if (!session) return;
    void ensureChannels();
    void ensurePermission();
    handleNotificationResponse();
  }, [session]);

  if (!booted) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {session ? <SessionHooks /> : null}
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
