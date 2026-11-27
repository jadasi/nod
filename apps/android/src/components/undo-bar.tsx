/**
 * The docked undo bar.
 *
 * The most forgiving surface in the app, so it gets the full emphasis set:
 * the accent tint, corner brackets, scanlines and the draining segmented
 * meter. Undo is never more than one tap away while the bar is visible.
 *
 * It reads only server timestamps (answeredAt / deliverAfter) and a ticking
 * `now`, so the same bar renders from the live decision or from a record
 * restored from encrypted storage after process death.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { tokens } from '@nod/design-tokens';
import { formatCountdown } from '@/lib/format.js';
import { meterFraction, remainingMs } from '@/lib/undo.js';
import { border, space, useColors } from '@/theme.js';
import { Brackets, Button, Meter, Scanlines, T } from './ui';
import { PixelIcon } from './pixel';

export interface UndoSpec {
  decisionId: string;
  label: string;
  answeredAt: string;
  deliverAfter: string;
}

const BAR_HEIGHT = 96;

export function UndoBar({
  spec,
  now,
  onUndo,
  busy,
}: {
  spec: UndoSpec;
  now: number;
  onUndo: () => void;
  busy?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const left = remainingMs(spec.deliverAfter, now);
  const fraction = meterFraction(spec.answeredAt, spec.deliverAfter, now);
  const expired = left <= 0;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: colors.accentDeep,
        borderTopWidth: border.hairline,
        borderTopColor: colors.accentInk,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{ padding: space[4], gap: space[3] }}>
        <Scanlines height={BAR_HEIGHT} />
        <Brackets color={colors.accentInk} inset={space[1]} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <PixelIcon
            name={expired ? 'send' : 'clock'}
            size={tokens.icon.md}
            color={colors.accentInk}
          />
          <View style={{ flex: 1 }}>
            <T step="title" color={colors.accentInk}>
              {expired ? 'Sending…' : `Sending in ${formatCountdown(left)}`}
            </T>
            <T step="small" color={colors.accentInk} numberOfLines={1}>
              {spec.label}
            </T>
          </View>
          {expired ? null : (
            <Button
              label="Undo"
              icon="undo"
              tone="accentOutline"
              onPress={onUndo}
              disabled={busy}
              accessibilityHint="Take the answer back before Nod sends it"
            />
          )}
        </View>

        <Meter fraction={expired ? 0 : fraction} />
      </View>
    </View>
  );
}
