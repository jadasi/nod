/**
 * List groups, section heads and the empty state.
 *
 * Settings is a stack of grouped panels rather than a flat list of rows:
 * common region does the grouping work, so the rows themselves can stay
 * quiet (Gestalt — common region and uniform connectedness).
 */
import type { ReactNode } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { tokens } from '@nod/design-tokens';
import { border, radius, space, useColors } from '@/theme.js';
import { PixelIcon, PixelIllustration, PixelText, type IconName } from './pixel';
import { Button, Divider, Label, T } from './ui';

/** The uppercase group heading above a settings panel. */
export function SectionHead({ title, meta }: { title: string; meta?: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: space[3],
        marginTop: space[5],
        marginBottom: space[2],
      }}
    >
      <View style={{ flex: 1 }}>
        <Label>{title}</Label>
      </View>
      {meta ? (
        <T step="label" color={colors.textFaint} weight="600">
          {meta}
        </T>
      ) : null}
    </View>
  );
}

/** A bordered group; rows inside are separated by hairlines. */
export function ListGroup({ children }: { children: ReactNode }) {
  const colors = useColors();
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: border.hairline,
        borderColor: colors.line,
        borderRadius: radius,
        overflow: 'hidden',
      }}
    >
      {items.map((child, i) => (
        <View key={i}>
          {i === 0 ? null : <Divider />}
          {child as ReactNode}
        </View>
      ))}
    </View>
  );
}

/**
 * One settings row: icon, label, a second line of detail, and a trailing
 * value or control. The whole row is the target when it acts as a button
 * (Fitts's Law — a 44px full-width target beats a chevron).
 */
export function ListRow({
  icon,
  label,
  detail,
  value,
  valueTone = 'dim',
  trailing,
  onPress,
  disabled,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  value?: string;
  valueTone?: 'dim' | 'accent' | 'amber';
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const valueColor =
    valueTone === 'accent'
      ? colors.accentInk
      : valueTone === 'amber'
        ? colors.amber
        : colors.textDim;

  const body = (
    <>
      {icon ? (
        <PixelIcon
          name={icon}
          size={tokens.icon.md}
          color={colors.textDim}
          style={{ marginTop: 2 }}
        />
      ) : null}
      <View style={{ flex: 1, gap: space[1] }}>
        <T step="body">{label}</T>
        {detail ? (
          <T step="small" color={colors.textDim}>
            {detail}
          </T>
        ) : null}
      </View>
      {value ? (
        <T step="body" color={valueColor} weight="600">
          {value}
        </T>
      ) : null}
      {trailing}
      {onPress && !disabled ? (
        <PixelIcon name="chevronRight" size={tokens.icon.sm} color={colors.textFaint} />
      ) : null}
    </>
  );

  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[3],
    minHeight: tokens.size.control,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    opacity: disabled ? 0.6 : 1,
  };

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [style, pressed ? { backgroundColor: colors.surfaceRaised } : null]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={style}>{body}</View>;
}

/** A settings row whose control is a switch. */
export function SwitchRow({
  icon,
  label,
  detail,
  value,
  onChange,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const colors = useColors();
  return (
    <ListRow
      icon={icon}
      label={label}
      detail={detail}
      trailing={
        <Switch
          value={value}
          onValueChange={onChange}
          accessibilityLabel={label}
          trackColor={{ false: colors.line, true: colors.accent }}
          thumbColor={value ? colors.onAccent : colors.surfaceRaised}
          ios_backgroundColor={colors.line}
        />
      }
    />
  );
}

/**
 * The "ALL CLEAR" empty state: the two-ink illustration, the pixel heading,
 * one line on what is waiting, and the way out. An empty state with a next
 * step is not a dead end.
 */
export function EmptyState({
  illo = 'empty',
  heading,
  line,
  action,
}: {
  illo?: 'empty' | 'signin';
  heading: string;
  line?: string;
  action?: { label: string; icon?: IconName; onPress: () => void };
}) {
  const colors = useColors();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: space[4],
        paddingVertical: space[7],
        paddingHorizontal: space[5],
        borderWidth: border.hairline,
        borderColor: colors.line,
        borderStyle: 'dashed',
        borderRadius: radius,
      }}
    >
      <PixelIllustration name={illo} width={160} color={colors.textDim} accent={colors.accentInk} />
      <PixelText text={heading} scale={tokens.pixel.scale.heading} color={colors.text} />
      {line ? (
        <T step="body" color={colors.textDim} style={{ textAlign: 'center' }}>
          {line}
        </T>
      ) : null}
      {action ? (
        <Button label={action.label} icon={action.icon} onPress={action.onPress} compact />
      ) : null}
    </View>
  );
}
