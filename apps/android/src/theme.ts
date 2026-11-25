/**
 * The Phosphor theme for the phone.
 *
 * Resolves the active theme (System / Light / Dark, the same three modes and
 * `nod.theme` meaning as the web toggle) and re-exports the token scales so
 * no screen ever picks a raw number. Every colour, space, type step, border
 * and duration in `apps/android` comes from here.
 */
import type { ColorToken, ThemeName } from '@nod/design-tokens';
import { tokens } from '@nod/design-tokens';
import { useColorScheme } from 'react-native';
import { useAppStore } from '@/state.js';

export function useThemeName(): ThemeName {
  const mode = useAppStore((s) => s.settings.theme);
  const system = useColorScheme();
  if (mode === 'system') return system === 'dark' ? 'dark' : 'light';
  return mode;
}

/** The resolved colour tokens of the active theme. */
export function useColors(): Record<ColorToken, string> {
  const name = useThemeName();
  return tokens.themes[name].color as Record<ColorToken, string>;
}

/** The scanline ink of the active theme (used by the undo bar). */
export function useScanlineInk(): string {
  const name = useThemeName();
  return tokens.themes[name].effect.scanline;
}

/**
 * The spacing scale. `space[4]` is 16px. Nothing in the app may use a gap,
 * padding or margin that is not one of these.
 */
export const space = tokens.space;

/** Square corners everywhere: Nod is square, the Android chrome is round. */
export const radius = tokens.radius.none;

export const border = tokens.border;
export const motion = tokens.motion;
export const sizes = tokens.size;
export const pixel = tokens.pixel;

/**
 * The type scale as ready-made React Native text styles. `label` is the
 * uppercase tracked micro-label, `lead` the impact paragraph.
 */
type TypeStep = keyof typeof tokens.type;

export const type = Object.fromEntries(
  (Object.keys(tokens.type) as TypeStep[]).map((step) => {
    const t = tokens.type[step];
    return [
      step,
      {
        fontSize: t.size,
        lineHeight: t.lineHeight,
        fontWeight: String(t.weight) as '400' | '600' | '700',
        letterSpacing: t.tracking,
        ...(t.case === 'upper' ? { textTransform: 'uppercase' as const } : {}),
      },
    ];
  }),
) as Record<
  TypeStep,
  {
    fontSize: number;
    lineHeight: number;
    fontWeight: '400' | '600' | '700';
    letterSpacing: number;
    textTransform?: 'uppercase';
  }
>;
