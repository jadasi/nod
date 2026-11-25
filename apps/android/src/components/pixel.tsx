/**
 * The pixel layer: the Nod Pixel 5x7 face, the 12x12 icon grids and the
 * two-ink illustrations from @nod/design-tokens, drawn as plain Views.
 *
 * Ink convention, the same as the web (`generate.mjs`): `#` is the base ink
 * and `+` the accent ink. Icons are single-ink; illustrations use both.
 */
import type { IconName } from '@nod/design-tokens';
import { icons, illustrations, pixelText, tokens } from '@nod/design-tokens';
import { View, type ViewStyle } from 'react-native';
import { pixel, space } from '@/theme.js';

export type { IconName };

function Grid({
  rows,
  cell,
  ink,
  accentInk,
  style,
}: {
  rows: readonly string[];
  cell: number;
  ink: string;
  accentInk?: string;
  style?: ViewStyle;
}) {
  const width = (rows[0]?.length ?? 0) * cell;
  const height = rows.length * cell;
  return (
    <View style={[{ width, height }, style]} accessible={false} importantForAccessibility="no">
      {rows.map((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : (
            <View
              key={`${x}-${y}`}
              style={{
                position: 'absolute',
                left: x * cell,
                top: y * cell,
                width: cell,
                height: cell,
                backgroundColor: ch === '+' ? (accentInk ?? ink) : ink,
              }}
            />
          ),
        ),
      )}
    </View>
  );
}

/**
 * A pixel icon on the 12x12 grid. `size` is the drawn edge in px; it is
 * rounded down to a whole number of cells so the art stays crisp.
 */
export function PixelIcon({
  name,
  size = tokens.icon.md,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color: string;
  style?: ViewStyle;
}) {
  const rows = icons[name].rows;
  const cell = Math.max(1, Math.floor(size / tokens.icon.grid));
  return <Grid rows={rows} cell={cell} ink={color} style={style} />;
}

/** Pixel display text in the Nod Pixel 5x7 face. Never for running text. */
export function PixelText({
  text,
  scale = pixel.scale.heading,
  color,
  glow,
  style,
}: {
  text: string;
  scale?: number;
  color: string;
  /** The phosphor glow, for the wordmark in the dark theme only. */
  glow?: boolean;
  style?: ViewStyle;
}) {
  const { width, height, cells } = pixelText(text);
  // The glow is the token's own shadow string, applied per cell: on the
  // container it would draw a rectangle around the whole wordmark instead
  // of following the glyphs.
  const shadow = glow ? tokens.themes.dark.effect.glow : undefined;
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel={text}
      style={[{ width: width * scale, height: height * scale }, style]}
    >
      {cells.map(([x, y], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: x * scale,
            top: y * scale,
            width: scale,
            height: scale,
            backgroundColor: color,
            ...(shadow ? { boxShadow: shadow } : {}),
          }}
        />
      ))}
    </View>
  );
}

/**
 * A two-ink pixel illustration (`empty`, `signin`). The base reads in
 * `color`, the highlights in `accent`, as on the web.
 */
export function PixelIllustration({
  name,
  width,
  color,
  accent,
}: {
  name: keyof typeof illustrations;
  width: number;
  color: string;
  accent: string;
}) {
  const rows = illustrations[name].rows;
  const cell = Math.max(1, Math.floor(width / (rows[0]?.length ?? 1)));
  return <Grid rows={rows} cell={cell} ink={color} accentInk={accent} />;
}

/**
 * A screen or section heading set in the pixel face, with the dot-matrix
 * scale from the tokens. Used for INBOX, UPDATES, ALL CLEAR.
 */
export function PixelHeading({
  text,
  color,
  scale = pixel.scale.heading,
}: {
  text: string;
  color: string;
  scale?: number;
}) {
  return <PixelText text={text} scale={scale} color={color} style={{ marginVertical: space[1] }} />;
}
