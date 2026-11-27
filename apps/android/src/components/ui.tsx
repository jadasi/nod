/**
 * The Phosphor UI kit for the phone.
 *
 * Every screen is built from these. The rules the kit enforces:
 *   - type comes from the five steps in the token scale, never a loose size;
 *   - space comes from the 4px scale;
 *   - corners are square (Nod is square, the Android chrome stays round);
 *   - pixel effects are emphasis, not decoration: corner brackets mark a
 *     surface that needs David, scanlines mark the live undo window.
 */
import type { ReactNode } from 'react';
import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { tokens } from '@nod/design-tokens';
import { border, radius, space, type, useColors, useScanlineInk } from '@/theme.js';
import { PixelIcon, type IconName } from './pixel';

/* -------------------------------------------------------------- type ---- */

type TypeStep = keyof typeof type;

/** Running text on the type scale. `step` picks the step; nothing else sets a size. */
export function T({
  step = 'body',
  color,
  weight,
  numberOfLines,
  style,
  onPress,
  children,
}: {
  step?: TypeStep;
  color?: string;
  weight?: '400' | '600' | '700';
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  onPress?: () => void;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <Text
      numberOfLines={numberOfLines}
      onPress={onPress}
      accessibilityRole={onPress ? 'link' : undefined}
      style={[
        type[step],
        { color: color ?? colors.text },
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** The uppercase tracked micro-label above a group (IMPACT, YOUR CALL). */
export function Label({ children, color }: { children: ReactNode; color?: string }) {
  const colors = useColors();
  return (
    <T step="label" color={color ?? colors.textDim} weight="700">
      {children}
    </T>
  );
}

/* ----------------------------------------------------------- effects ---- */

/**
 * Corner brackets: the Phosphor signifier for "this needs you". Four L
 * shapes just inside the edge of a surface. Decorative, so hidden from
 * the screen reader — the meaning is always also in the text.
 */
export function Brackets({
  color,
  inset = 0,
  arm = 10,
  weight = 2,
}: {
  color: string;
  inset?: number;
  arm?: number;
  weight?: number;
}) {
  // Eight bars, flat: every arm is positioned against the bracket frame
  // itself. A wrapper View per corner would become the containing block
  // and drag the bottom arms to the top edge.
  const corners: ViewStyle[] = [
    { top: inset, left: inset },
    { top: inset, right: inset },
    { bottom: inset, left: inset },
    { bottom: inset, right: inset },
  ];
  return (
    <View pointerEvents="none" style={StyleSheetAbsolute} importantForAccessibility="no">
      {corners.map((c, i) => (
        <View
          key={`v${i}`}
          style={{ position: 'absolute', width: weight, height: arm, backgroundColor: color, ...c }}
        />
      ))}
      {corners.map((c, i) => (
        <View
          key={`h${i}`}
          style={{ position: 'absolute', width: arm, height: weight, backgroundColor: color, ...c }}
        />
      ))}
    </View>
  );
}

const StyleSheetAbsolute: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

/**
 * Scanlines at the token pitch. Information, not decoration: they mark the
 * surface that is counting down, so they stay under reduced motion (they
 * do not move).
 */
export function Scanlines({ height }: { height: number }) {
  const ink = useScanlineInk();
  const pitch = tokens.emphasis.scanlinePitch;
  const count = Math.ceil(height / pitch);
  return (
    <View pointerEvents="none" style={StyleSheetAbsolute} importantForAccessibility="no">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: i * pitch,
            height: 1,
            backgroundColor: ink,
          }}
        />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------ surface ---- */

export type PanelTone = 'plain' | 'needsYou' | 'urgent' | 'attention';

/**
 * A panel: the one card surface in the app. `tone` decides the emphasis —
 * a plain gray outline, accent brackets when it needs an answer, a red edge
 * and red brackets when it is urgent, an amber left edge for repair items.
 */
export function Panel({
  tone = 'plain',
  dimmed,
  style,
  children,
}: {
  tone?: PanelTone;
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const colors = useColors();
  const bracket =
    tone === 'urgent' ? colors.red : tone === 'needsYou' ? colors.accentInk : undefined;
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: border.hairline,
          // Urgent is carried by the red left edge and the red brackets, not
          // by a red box: a full frame competes with the content inside it.
          borderColor: colors.line,
          borderRadius: radius,
          opacity: dimmed ? 0.55 : 1,
        },
        tone === 'urgent' ? { borderLeftWidth: border.accent, borderLeftColor: colors.red } : null,
        tone === 'attention'
          ? { borderLeftWidth: border.accent, borderLeftColor: colors.amber }
          : null,
        style,
      ]}
    >
      {children}
      {bracket ? <Brackets color={bracket} inset={-1} /> : null}
    </View>
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={{ height: border.hairline, backgroundColor: colors.line }} />;
}

/* ----------------------------------------------------------- controls ---- */

export type ButtonTone = 'primary' | 'outline' | 'danger' | 'quiet' | 'accentOutline';

/**
 * A control. Square, at least the 44px touch target, label on the type
 * scale. One primary (green) per screen: that rule is the whole accent
 * system.
 */
export function Button({
  label,
  icon,
  tone = 'outline',
  onPress,
  disabled,
  grow,
  compact,
  accessibilityHint,
}: {
  label: string;
  icon?: IconName;
  tone?: ButtonTone;
  onPress?: PressableProps['onPress'];
  disabled?: boolean;
  /** Fill the row (the full-width option buttons and the dock). */
  grow?: boolean;
  /** The smaller 32px control, for inline actions like Refresh. */
  compact?: boolean;
  accessibilityHint?: string;
}) {
  const colors = useColors();
  const fg =
    tone === 'primary'
      ? colors.onAccent
      : tone === 'danger'
        ? colors.red
        : tone === 'accentOutline'
          ? colors.accentInk
          : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        {
          minHeight: compact ? tokens.size.controlSmall : tokens.size.control,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          paddingHorizontal: compact ? space[3] : space[4],
          paddingVertical: compact ? space[1] : space[2],
          borderRadius: radius,
          borderWidth: border.hairline,
          backgroundColor:
            tone === 'primary'
              ? colors.accent
              : pressed
                ? colors.surfaceRaised
                : tone === 'quiet' || tone === 'accentOutline'
                  ? 'transparent'
                  : colors.surface,
          borderColor:
            tone === 'primary'
              ? colors.accent
              : tone === 'danger'
                ? colors.red
                : tone === 'accentOutline'
                  ? colors.accentInk
                  : tone === 'quiet'
                    ? 'transparent'
                    : colors.lineStrong,
          opacity: disabled ? 0.45 : 1,
        },
        grow ? { flex: 1 } : null,
      ]}
    >
      {icon ? <PixelIcon name={icon} size={tokens.icon.sm + 4} color={fg} /> : null}
      <T step="label" color={fg} weight="700">
        {label}
      </T>
    </Pressable>
  );
}

/** A filter chip (All / Needs you / Attention). */
export function Chip({
  label,
  count,
  selected,
  tone = 'neutral',
  icon,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  tone?: 'neutral' | 'attention';
  icon?: IconName;
  onPress: () => void;
}) {
  const colors = useColors();
  const attention = tone === 'attention';
  const fg = selected
    ? attention
      ? colors.amber
      : colors.bg
    : attention
      ? colors.amber
      : colors.textDim;
  const bg = selected ? (attention ? colors.amberDeep : colors.text) : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      style={{
        minHeight: tokens.size.controlSmall,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingHorizontal: space[3],
        borderRadius: radius,
        borderWidth: border.hairline,
        borderColor: attention ? colors.amber : selected ? colors.text : colors.lineStrong,
        backgroundColor: bg,
      }}
    >
      {icon ? <PixelIcon name={icon} size={tokens.icon.sm} color={fg} /> : null}
      <T step="small" color={fg} weight="600">
        {label}
      </T>
      {count === undefined ? null : (
        <T step="small" color={fg} weight="700">
          {count}
        </T>
      )}
    </Pressable>
  );
}

/** The three-way segmented control (System / Light / Dark). */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  label: string;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        borderWidth: border.hairline,
        borderColor: colors.lineStrong,
        borderRadius: radius,
      }}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={{
              minHeight: tokens.size.controlSmall,
              justifyContent: 'center',
              paddingHorizontal: space[3],
              backgroundColor: selected ? colors.text : 'transparent',
              borderLeftWidth: i === 0 ? 0 : border.hairline,
              borderLeftColor: colors.lineStrong,
            }}
          >
            <T step="small" color={selected ? colors.bg : colors.textDim} weight="600">
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------- status ---- */

export type TagTone = 'urgent' | 'external' | 'write' | 'answered' | 'source';

/** A tag above a title: Urgent, From external, Answered, source · agent. */
export function Tag({
  tone,
  icon,
  children,
}: {
  tone: TagTone;
  icon?: IconName;
  children: ReactNode;
}) {
  const colors = useColors();
  const map: Record<TagTone, { fg: string; bg?: string; bc?: string }> = {
    urgent: { fg: colors.onRed, bg: colors.red, bc: colors.red },
    external: { fg: colors.amber, bc: colors.amber },
    write: { fg: colors.amber, bc: colors.amber },
    answered: { fg: colors.accentInk, bc: colors.accentInk },
    source: { fg: colors.textDim, bc: colors.line },
  };
  const t = map[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        alignSelf: 'flex-start',
        paddingHorizontal: space[2],
        paddingVertical: space[1],
        borderRadius: radius,
        borderWidth: border.hairline,
        borderColor: t.bc ?? 'transparent',
        backgroundColor: t.bg ?? 'transparent',
      }}
    >
      {icon ? <PixelIcon name={icon} size={tokens.icon.sm} color={t.fg} /> : null}
      <T step="label" color={t.fg} weight="700">
        {children}
      </T>
    </View>
  );
}

export type BannerKind = 'undo' | 'sending' | 'held' | 'done' | 'stale' | 'failed';

/**
 * A status banner inside a card or the detail: the repair and delivery
 * states. Colour never carries the meaning alone — each kind has an icon
 * and its own words.
 */
export function Banner({ kind, children }: { kind: BannerKind; children: ReactNode }) {
  const colors = useColors();
  const map: Record<BannerKind, { fg: string; bg: string; icon: IconName }> = {
    undo: { fg: colors.accentInk, bg: colors.accentDeep, icon: 'clock' },
    sending: { fg: colors.accentInk, bg: colors.accentDeep, icon: 'send' },
    done: { fg: colors.accentInk, bg: colors.accentDeep, icon: 'check' },
    held: { fg: colors.amber, bg: colors.amberDeep, icon: 'clock' },
    stale: { fg: colors.red, bg: colors.redDeep, icon: 'stale' },
    failed: { fg: colors.red, bg: colors.redDeep, icon: 'close' },
  };
  const b = map[kind];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[3],
        borderRadius: radius,
        borderWidth: border.hairline,
        borderColor: b.fg,
        backgroundColor: b.bg,
      }}
    >
      <PixelIcon name={b.icon} size={tokens.icon.md} color={b.fg} />
      <T step="body" color={b.fg} weight="600" style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

/** The amber callout that marks external provenance. */
export function Callout({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View
      style={{
        gap: space[2],
        padding: space[3],
        borderRadius: radius,
        borderWidth: border.hairline,
        borderColor: colors.amber,
        backgroundColor: colors.amberDeep,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <PixelIcon name="mail" size={tokens.icon.md} color={colors.amber} />
        <T step="body" color={colors.amber} weight="700" style={{ flex: 1 }}>
          {title}
        </T>
      </View>
      <T step="small" color={colors.amber}>
        {children}
      </T>
    </View>
  );
}

/**
 * The draining dotted meter on the undo bar. Segments, not a smooth bar:
 * it reads as a count, and it survives reduced motion because it is
 * information, not animation.
 */
export function Meter({ fraction, segments = 32 }: { fraction: number; segments?: number }) {
  const colors = useColors();
  const lit = Math.round(Math.max(0, Math.min(1, fraction)) * segments);
  return (
    <View
      style={{ flexDirection: 'row', gap: 2 }}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
    >
      {Array.from({ length: segments }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: space[2],
            backgroundColor: i < lit ? colors.accent : colors.surfaceRaised,
          }}
        />
      ))}
    </View>
  );
}

export type NoticeTone = 'offline' | 'quiet' | 'dryRun';

/**
 * A full-width strip above the content: offline, quiet hours, dry run.
 * These are conditions of the whole screen, so they sit outside the list
 * and stay put while it scrolls.
 */
export function NoticeStrip({
  tone,
  title,
  detail,
}: {
  tone: NoticeTone;
  title: string;
  detail?: string;
}) {
  const colors = useColors();
  const map: Record<NoticeTone, { fg: string; bg: string; icon: IconName }> = {
    offline: { fg: colors.red, bg: colors.redDeep, icon: 'offline' },
    quiet: { fg: colors.textDim, bg: colors.surfaceRaised, icon: 'moon' },
    dryRun: { fg: colors.amber, bg: colors.amberDeep, icon: 'power' },
  };
  const n = map[tone];
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        backgroundColor: n.bg,
        borderBottomWidth: border.hairline,
        borderBottomColor: n.fg,
      }}
    >
      <PixelIcon name={n.icon} size={tokens.icon.md} color={n.fg} />
      <View style={{ flex: 1, gap: space[1] }}>
        <T step="small" color={n.fg} weight="700">
          {title}
        </T>
        {detail ? (
          <T step="small" color={n.fg}>
            {detail}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** A loading placeholder block. Skeletons, not spinners: the list has shape. */
export function Skeleton({ height, width }: { height: number; width?: number | `${number}%` }) {
  const colors = useColors();
  return (
    <View
      importantForAccessibility="no"
      style={{
        height,
        width: width ?? '100%',
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius,
      }}
    />
  );
}
