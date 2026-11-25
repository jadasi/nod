/**
 * PROVISIONAL UI — functional placeholder, owned by Designer (BYT-753).
 * The docked undo bar: "Sending in m:ss", the Undo button and the draining
 * meter. Reads only server timestamps (answeredAt / deliverAfter) and a
 * ticking `now`, so it can be driven by the live decision or by a record
 * restored from encrypted storage.
 */
import { formatCountdown } from '@/lib/format.js';
import { meterFraction, remainingMs } from '@/lib/undo.js';
import { useColors } from '@/theme.js';
import { Pressable, Text, View } from 'react-native';

export interface UndoSpec {
  decisionId: string;
  label: string;
  answeredAt: string;
  deliverAfter: string;
}

export function UndoBar({
  spec,
  now,
  onUndo,
  onOpen,
}: {
  spec: UndoSpec;
  now: number;
  onUndo: () => void;
  onOpen?: () => void;
}) {
  const colors = useColors();
  const left = remainingMs(spec.deliverAfter, now);
  const fraction = meterFraction(spec.answeredAt, spec.deliverAfter, now);

  return (
    <View
      style={{
        backgroundColor: colors.accentDeep,
        borderTopWidth: 1,
        borderTopColor: colors.accent,
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={onOpen}
          accessibilityRole={onOpen ? 'button' : undefined}
          style={{ flex: 1 }}
        >
          <Text style={{ color: colors.accentInk, fontSize: 15, fontWeight: '700' }}>
            {`Sending “${spec.label}” in ${formatCountdown(left)}`}
          </Text>
        </Pressable>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          style={{
            backgroundColor: colors.accent,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 2,
          }}
        >
          <Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: '700' }}>Undo</Text>
        </Pressable>
      </View>
      <View style={{ height: 3, backgroundColor: colors.surfaceRaised }}>
        <View style={{ height: 3, width: `${fraction * 100}%`, backgroundColor: colors.accent }} />
      </View>
    </View>
  );
}
