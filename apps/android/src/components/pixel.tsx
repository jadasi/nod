/**
 * PROVISIONAL UI — functional placeholder, owned by Designer (BYT-753).
 * Renders the Nod pixel font and the 12x12 icon grids from @nod/design-tokens
 * as plain Views, so the app reads as Nod before the design pass lands.
 */
import type { IconName } from '@nod/design-tokens';
import { icons, pixelText } from '@nod/design-tokens';
import { View } from 'react-native';

/** A pixel icon (icons.json grid): '#' and '+' both draw in `color`. */
export function PixelIcon({
  name,
  cell = 3,
  color,
}: {
  name: IconName;
  cell?: number;
  color: string;
}) {
  const rows = icons[name].rows;
  return (
    <View style={{ width: (rows[0]?.length ?? 0) * cell, height: rows.length * cell }}>
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
                backgroundColor: color,
              }}
            />
          ),
        ),
      )}
    </View>
  );
}

/** Pixel-wordmark / heading text in the Nod Pixel 5x7 face. */
export function PixelText({
  text,
  cell = 2,
  color,
}: {
  text: string;
  cell?: number;
  color: string;
}) {
  const { width, height, cells } = pixelText(text);
  return (
    <View style={{ width: width * cell, height: height * cell }}>
      {cells.map(([x, y], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: x * cell,
            top: y * cell,
            width: cell,
            height: cell,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
