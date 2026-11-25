/**
 * Resolves the active theme (System / Light / Dark, the same three modes and
 * `nod.theme` meaning as the web toggle) and exposes the Phosphor colour
 * tokens from @nod/design-tokens.
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
