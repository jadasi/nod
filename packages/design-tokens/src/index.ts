// @nod/design-tokens: one source of truth for the web inbox, the Android app and the G2 glasses.
// Values live in tokens.json, icons.json and pixel-font.json; `generated.ts` is built from them.
import { pixelFont, tokens } from './generated.js';

export { appIcon, icons, pixelFont, tokens } from './generated.js';

export type ColorToken = keyof typeof tokens.color;
export type IconName = keyof typeof import('./generated.js').icons;

/** A colour token's hex value. */
export const color = (name: ColorToken): string => tokens.color[name].value;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #rrggbb colours, e.g. 4.5 for AA body text. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Lays out text in the Nod Pixel 5x7 face. Returns lit cells in grid units, for drawing as
 * rectangles (web SVG, react-native-svg) or straight onto the glasses' framebuffer.
 */
export function pixelText(text: string): {
  width: number;
  height: number;
  cells: [number, number][];
} {
  const glyphs = pixelFont.glyphs as Record<string, readonly string[]>;
  const cells: [number, number][] = [];
  let x = 0;
  for (const ch of text.toUpperCase()) {
    const g = glyphs[ch] ?? glyphs[' ']!;
    g.forEach((row, y) => [...row].forEach((c, i) => c === '#' && cells.push([x + i, y])));
    x += (g[0]?.length ?? 0) + tokens.pixel.tracking;
  }
  return { width: Math.max(0, x - tokens.pixel.tracking), height: pixelFont.height, cells };
}

/** A glasses brightness level (0-15) for a colour token. See README.md. */
export const glassesLevel = (name: ColorToken): number => tokens.glasses.level[name];
