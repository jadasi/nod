/**
 * PROVISIONAL UI — functional placeholder, owned by Designer (BYT-753).
 * The app bar: the NOD wordmark, the LIVE/OFFLINE marker, and the glasses
 * state (shown only when the RayNeo mirror is on).
 */
import { useAppStore } from '@/state.js';
import { useColors } from '@/theme.js';
import { View } from 'react-native';
import { PixelIcon, PixelText } from './pixel';

export function AppHeader() {
  const colors = useColors();
  const live = useAppStore((s) => s.live);
  const glassesMirror = useAppStore((s) => s.settings.glassesMirror);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <PixelText text="NOD" cell={2} color={colors.accentInk} />
      <View
        style={{
          width: 8,
          height: 12,
          backgroundColor: live ? colors.accent : colors.red,
        }}
        accessibilityLabel={live ? 'Live' : 'Offline'}
        accessibilityRole="text"
      />
      <View style={{ flex: 1 }} />
      {glassesMirror ? <PixelIcon name="glasses" cell={2} color={colors.textDim} /> : null}
    </View>
  );
}
