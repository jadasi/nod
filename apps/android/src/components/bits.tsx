/**
 * PROVISIONAL UI — functional placeholder, owned by Designer (BYT-753).
 * Small shared primitives, built from the Phosphor tokens only: tags,
 * status banners, filter chips, settings rows and the empty state.
 */
import type { ColorToken } from '@nod/design-tokens';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/theme.js';
import { PixelText } from './pixel';

export type TagTone = 'urgent' | 'external' | 'write' | 'accent' | 'dim';

const TONE_COLORS: Record<TagTone, { fg: ColorToken; bg?: ColorToken }> = {
  urgent: { fg: 'onRed', bg: 'red' },
  external: { fg: 'amber', bg: 'amberDeep' },
  write: { fg: 'amber', bg: 'amberDeep' },
  accent: { fg: 'accentInk', bg: 'accentDeep' },
  dim: { fg: 'textDim' },
};

export function Tag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  const colors = useColors();
  const t = TONE_COLORS[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        paddingVertical: 2,
        paddingHorizontal: 6,
        ...(t.bg ? { backgroundColor: colors[t.bg] } : {}),
      }}
    >
      <Text
        style={{ color: colors[t.fg], fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}
      >
        {children}
      </Text>
    </View>
  );
}

export type BannerKind = 'undo' | 'sending' | 'held' | 'done' | 'stale' | 'failed';

const BANNER_COLORS: Record<BannerKind, { fg: ColorToken; bg?: ColorToken }> = {
  undo: { fg: 'accentInk', bg: 'accentDeep' },
  sending: { fg: 'accentInk', bg: 'accentDeep' },
  held: { fg: 'amber', bg: 'amberDeep' },
  done: { fg: 'accentInk', bg: 'accentDeep' },
  stale: { fg: 'red', bg: 'redDeep' },
  failed: { fg: 'red', bg: 'redDeep' },
};

export function StatusBanner({ kind, children }: { kind: BannerKind; children: ReactNode }) {
  const colors = useColors();
  const b = BANNER_COLORS[kind];
  return (
    <View
      style={{
        padding: 12,
        backgroundColor: b.bg ? colors[b.bg] : 'transparent',
        borderRadius: 2,
      }}
    >
      <Text style={{ color: colors[b.fg], fontSize: 15 }}>{children}</Text>
    </View>
  );
}

/** A filter chip (All / Needs you / Attention). */
export function Chip({
  label,
  selected,
  tone = 'neutral',
  onPress,
}: {
  label: string;
  selected: boolean;
  tone?: 'neutral' | 'attention';
  onPress: () => void;
}) {
  const colors = useColors();
  const fg = tone === 'attention' ? 'amber' : 'text';
  const bg = tone === 'attention' ? 'amberDeep' : 'surfaceRaised';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 2,
        backgroundColor: selected ? colors[bg] : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors[fg === 'amber' ? 'amber' : 'lineStrong'] : colors.line,
      }}
    >
      <Text
        style={{ color: selected ? colors[fg] : colors.textDim, fontSize: 13, fontWeight: '600' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A settings list row: label, optional value, optional control. */
export function ListRow({
  label,
  value,
  note,
  trailing,
  onPress,
  disabled,
}: {
  label: string;
  value?: string;
  note?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    opacity: disabled ? 0.5 : 1,
  };
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 15 }}>{label}</Text>
        {note ? (
          <Text style={{ color: colors.textDim, fontSize: 12 }}>
            {value ? `${value} · ${note}` : note}
          </Text>
        ) : value ? (
          <Text style={{ color: colors.textDim, fontSize: 13 }}>{value}</Text>
        ) : null}
      </View>
      {trailing}
    </>
  );
  // The whole row is the touch target when it acts as a button.
  if (onPress && !disabled) {
    return (
      <Pressable style={style} onPress={onPress} accessibilityRole="button">
        {body}
      </Pressable>
    );
  }
  return <View style={style}>{body}</View>;
}

export function SectionHead({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text
      style={{
        color: colors.textDim,
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 20,
        marginBottom: 8,
        paddingHorizontal: 4,
      }}
    >
      {title}
    </Text>
  );
}

/** The "ALL CLEAR" empty state with the pixel illustration copy. */
export function EmptyState({ line }: { line?: string }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 12, marginTop: 64 }}>
      <PixelText text="ALL CLEAR" cell={3} color={colors.accentInk} />
      {line ? <Text style={{ color: colors.textDim, fontSize: 15 }}>{line}</Text> : null}
    </View>
  );
}
