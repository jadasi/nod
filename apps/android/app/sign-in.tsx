/**
 * Pair this phone.
 *
 * The design doc makes QR the primary path, with token paste as the
 * fallback — but QR needs a core pairing endpoint that phase 1 does not
 * have. So the screen keeps the doc's shape (wordmark, pixel heading, a
 * numbered two-step guide, a bracketed frame) and makes the step that
 * works today the one you can act on. The QR step is shown in the frame as
 * what is coming, not as a dead button: a control that does nothing is
 * worse than an honest note.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@nod/design-tokens';
import { border, radius, space, useColors, useThemeName } from '@/theme.js';
import { useAppStore } from '@/state.js';
import { PixelIcon, PixelIllustration, PixelText } from '@/components/pixel';
import { Brackets, Button, Label, T } from '@/components/ui';

const DEFAULT_SERVER = 'https://nod-core.up.railway.app';

function Step({ n, children }: { n: number; children: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
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
          {n}
        </T>
      </View>
      <T step="body" color={colors.textDim} style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

function Field({
  label,
  hint,
  ...input
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: space[2] }}>
      <Label>{label}</Label>
      <TextInput
        {...input}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        style={{
          ...tokens.type.body,
          fontWeight: '400',
          minHeight: tokens.size.control,
          backgroundColor: colors.surface,
          borderWidth: border.hairline,
          borderColor: colors.lineStrong,
          borderRadius: radius,
          color: colors.text,
          paddingHorizontal: space[3],
        }}
      />
      {hint ? (
        <T step="small" color={colors.textFaint}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export default function SignIn() {
  const colors = useColors();
  const theme = useThemeName();
  const insets = useSafeAreaInsets();
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
      setError(e instanceof Error ? e.message : 'Could not reach that server with that token.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: space[5],
          paddingTop: insets.top + space[6],
          paddingBottom: insets.bottom + space[6],
          gap: space[5],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: space[3] }}>
          <PixelText
            text="NOD"
            scale={tokens.pixel.scale.display}
            color={colors.accentInk}
            glow={theme === 'dark'}
          />
          <PixelText
            text="PAIR THIS PHONE"
            scale={tokens.pixel.scale.heading}
            color={colors.text}
          />
          <T step="body" color={colors.textDim}>
            Nod runs on your own server. Pair once and this phone gets its own device token.
          </T>
        </View>

        <View style={{ gap: space[3] }}>
          <Step n={1}>On your desk, open Nod → Settings → Device tokens.</Step>
          <Step n={2}>Paste the token for this phone below.</Step>
        </View>

        {/* The bracketed frame the doc gives the QR code. Until the pairing
            endpoint exists it holds the illustration and says so plainly. */}
        <View
          style={{
            alignItems: 'center',
            gap: space[3],
            paddingVertical: space[5],
            paddingHorizontal: space[4],
          }}
        >
          <Brackets color={colors.accentInk} arm={16} />
          <PixelIllustration
            name="signin"
            width={192}
            color={colors.textDim}
            accent={colors.accentInk}
          />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
            <PixelIcon
              name="key"
              size={tokens.icon.sm + 4}
              color={colors.textFaint}
              style={{ marginTop: space[1] }}
            />
            <T step="small" color={colors.textFaint} style={{ flex: 1 }}>
              Scanning a pairing QR arrives with the pairing endpoint.
            </T>
          </View>
        </View>

        <View style={{ gap: space[4] }}>
          <Field
            label="Server"
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="https://your-nod-core.example"
          />
          <Field
            label="Device token"
            value={token}
            onChangeText={setToken}
            secureTextEntry
            placeholder="Paste the token for this phone"
            hint="Kept in Android's encrypted storage and sent only to your server."
          />

          {error ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[2],
                padding: space[3],
                borderWidth: border.hairline,
                borderColor: colors.red,
                backgroundColor: colors.redDeep,
              }}
            >
              <PixelIcon name="alert" size={tokens.icon.md} color={colors.red} />
              <T step="small" color={colors.red} style={{ flex: 1 }}>
                {error}
              </T>
            </View>
          ) : null}

          <Button
            label={busy ? 'Checking…' : 'Pair this phone'}
            icon="key"
            tone="primary"
            onPress={() => void submit()}
            disabled={busy || token.trim().length === 0}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
