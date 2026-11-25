/**
 * Sign-in. PROVISIONAL UI (BYT-753). QR pairing lands in a later update (it
 * needs the core pairing endpoint); the device-token paste is the path that
 * works today, the same NOD_DEVICE_TOKEN flow as the web sign-in.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useColors } from '@/theme.js';
import { useAppStore } from '@/state.js';
import { PixelIcon, PixelText } from '@/components/pixel';

const DEFAULT_SERVER = 'https://nod-core.up.railway.app';

export default function SignIn() {
  const colors = useColors();
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await useAppStore.getState().signIn(serverUrl.trim(), token.trim());
      router.replace('/(tabs)/inbox');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' }}>
      <View style={{ gap: 8, marginBottom: 32 }}>
        <PixelText text="NOD" cell={5} color={colors.accentInk} />
        <Text style={{ color: colors.textDim, fontSize: 15 }}>Your decisions, on your phone.</Text>
      </View>

      <View style={{ gap: 16 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.textDim, fontSize: 12 }}>Server</Text>
          <TextInput
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://your-nod-core.example"
            placeholderTextColor={colors.textFaint}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.lineStrong,
              borderWidth: 1,
              borderRadius: 2,
              color: colors.text,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.textDim, fontSize: 12 }}>Device token</Text>
          <TextInput
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Paste the device token from Settings on the web app"
            placeholderTextColor={colors.textFaint}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.lineStrong,
              borderWidth: 1,
              borderRadius: 2,
              color: colors.text,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        </View>
        {error ? <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text> : null}
        <Pressable
          onPress={() => void submit()}
          disabled={busy || token.trim().length === 0}
          accessibilityRole="button"
          style={{
            backgroundColor: colors.accent,
            paddingVertical: 14,
            borderRadius: 2,
            alignItems: 'center',
            opacity: busy || token.trim().length === 0 ? 0.6 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={{ color: colors.onAccent, fontSize: 15, fontWeight: '700' }}>Sign in</Text>
          )}
        </Pressable>
      </View>

      <View style={{ marginTop: 32, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PixelIcon name="key" cell={2} color={colors.textDim} />
          <Text style={{ color: colors.textDim, fontSize: 13 }}>
            No camera? Paste a device token. QR pairing arrives in a later update.
          </Text>
        </View>
        <Text style={{ color: colors.textFaint, fontSize: 12 }}>
          The token is kept in Android's encrypted storage and sent only to Nod.
        </Text>
      </View>
    </View>
  );
}
