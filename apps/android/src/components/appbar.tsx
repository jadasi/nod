/**
 * The app bar and the screen head.
 *
 * The bar carries identity and connection: the NOD wordmark (or a back
 * control and a title on a stack screen), the LIVE / OFFLINE marker, the
 * glasses state when the mirror is on, and Call Me as a square button
 * always one tap away.
 *
 * The screen head below it carries the pixel heading and the count line —
 * the first thing the eye lands on, so the count is on the right where the
 * F-pattern ends.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, View } from 'react-native';
import { tokens } from '@nod/design-tokens';
import { border, space, useColors, useThemeName } from '@/theme.js';
import { useAppStore } from '@/state.js';
import { PixelHeading, PixelIcon, PixelText } from './pixel';
import { T } from './ui';

/** LIVE / OFFLINE, with the signal icon so the state is not colour alone. */
function Connection() {
  const colors = useColors();
  const live = useAppStore((s) => s.live);
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
      accessibilityRole="text"
      accessibilityLabel={live ? 'Connected to Nod' : 'Offline'}
    >
      <PixelIcon
        name={live ? 'live' : 'offline'}
        size={tokens.icon.sm + 4}
        color={live ? colors.accentInk : colors.red}
      />
      <T step="label" color={live ? colors.accentInk : colors.red} weight="700">
        {live ? 'Live' : 'Offline'}
      </T>
    </View>
  );
}

/**
 * Call Me. Phase 1 has no voice worker yet, so the control is present and
 * explicitly unavailable rather than missing — a disabled affordance that
 * says why beats a button that appears later and surprises.
 */
function CallButton({ enabled, onPress }: { enabled: boolean; onPress?: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel="Call Me"
      accessibilityState={{ disabled: !enabled }}
      accessibilityHint={enabled ? 'Start a call about this' : 'Call Me arrives in a later update'}
      style={({ pressed }) => ({
        width: tokens.size.control,
        height: tokens.size.control,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: border.hairline,
        borderColor: colors.lineStrong,
        backgroundColor: pressed ? colors.surfaceRaised : 'transparent',
        opacity: enabled ? 1 : 0.45,
      })}
    >
      <PixelIcon name="call" size={tokens.icon.md} color={colors.text} />
    </Pressable>
  );
}

export function AppHeader({
  title,
  onBack,
}: {
  /** A stack screen shows a title and a back control instead of the wordmark. */
  title?: string;
  onBack?: () => void;
}) {
  const colors = useColors();
  const theme = useThemeName();
  const insets = useSafeAreaInsets();
  const glassesMirror = useAppStore((s) => s.settings.glassesMirror);

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: colors.bg,
        borderBottomWidth: border.hairline,
        borderBottomColor: colors.line,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          height: tokens.size.control + space[4],
          paddingHorizontal: space[4],
        }}
      >
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={space[2]}
            style={{
              width: tokens.size.controlSmall,
              height: tokens.size.control,
              justifyContent: 'center',
            }}
          >
            <PixelIcon name="back" size={tokens.icon.md} color={colors.text} />
          </Pressable>
        ) : null}

        {title ? (
          <T step="title" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </T>
        ) : (
          <View style={{ flex: 1 }}>
            <PixelText
              text="NOD"
              scale={tokens.pixel.scale.heading + 1}
              color={colors.accentInk}
              glow={theme === 'dark'}
            />
          </View>
        )}

        {title ? null : <Connection />}
        {glassesMirror ? (
          <PixelIcon
            name="glasses"
            size={tokens.icon.md}
            color={colors.textDim}
            style={{ marginHorizontal: space[1] }}
          />
        ) : null}
        <CallButton enabled={false} />
      </View>
    </View>
  );
}

/**
 * The screen head: a pixel heading on the left, the live count on the
 * right. One hairline under it separates the head from the content.
 */
export function ScreenHead({ title, meta }: { title: string; meta?: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingTop: space[4],
        paddingBottom: space[3],
        borderBottomWidth: border.hairline,
        borderBottomColor: colors.line,
      }}
    >
      <View style={{ flex: 1 }}>
        <PixelHeading text={title} color={colors.text} />
      </View>
      {meta ? (
        <T step="label" color={colors.textDim} weight="700">
          {meta}
        </T>
      ) : null}
    </View>
  );
}
