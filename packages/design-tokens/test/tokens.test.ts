import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { outputs, repoRoot } from '../scripts/generate.mjs';
import {
  color,
  contrastRatio,
  icons,
  illustrations,
  pixelFont,
  pixelText,
  tokens,
  type ColorToken,
  type ThemeName,
} from '../src/index.js';

describe('generated files', () => {
  const files = outputs() as Map<string, string>;
  for (const [rel, content] of files) {
    it(`${rel} is in sync with the token sources`, () => {
      // If this fails, run: pnpm --filter @nod/design-tokens generate
      expect(readFileSync(resolve(repoRoot, rel), 'utf8')).toBe(content);
    });
  }

  it('leaves no icon SVG behind for a removed icon', () => {
    const svgs = readdirSync(resolve(repoRoot, 'packages/design-tokens/icons'));
    expect(svgs.map((f) => `packages/design-tokens/icons/${f}`).sort()).toEqual(
      [...files.keys()].filter((k) => k.startsWith('packages/design-tokens/icons/')).sort(),
    );
  });
});

describe('contrast', () => {
  for (const theme of Object.keys(tokens.themes) as ThemeName[]) {
    const hex = (name: string) => color(name as ColorToken, theme);
    for (const [fg, bg] of tokens.contrast.text) {
      it(`${theme}: text ${fg} on ${bg} meets WCAG AA (4.5:1)`, () => {
        expect(contrastRatio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [fg, bg] of tokens.contrast.nonText) {
      it(`${theme}: non-text ${fg} on ${bg} meets 3:1`, () => {
        expect(contrastRatio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(3);
      });
    }
    it(`${theme}: defines every colour token`, () => {
      expect(Object.keys(tokens.themes[theme].color).sort()).toEqual(
        Object.keys(tokens.color).sort(),
      );
    });
  }

  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('icons', () => {
  for (const [name, icon] of Object.entries(icons)) {
    it(`${name} is a 12x12 grid of '#' and '.'`, () => {
      expect(icon.rows).toHaveLength(tokens.icon.grid);
      for (const row of icon.rows) expect(row).toMatch(/^[#.]{12}$/);
      expect(icon.path.length).toBeGreaterThan(0);
    });
  }
});

describe('illustrations', () => {
  for (const [name, illo] of Object.entries(illustrations)) {
    it(`${name} is a rectangular grid with both inks`, () => {
      for (const row of illo.rows) expect(row).toMatch(new RegExp(`^[#.+]{${illo.width}}$`));
      expect(illo.path.length).toBeGreaterThan(0);
      expect(illo.accentPath.length).toBeGreaterThan(0);
    });
  }
});

describe('pixel font', () => {
  it('has 7-row glyphs of even width', () => {
    for (const [ch, rows] of Object.entries(pixelFont.glyphs)) {
      expect(rows, ch).toHaveLength(pixelFont.height);
      expect(new Set(rows.map((r) => r.length)).size, ch).toBe(1);
    }
  });

  it('covers digits, A-Z and the clock separator', () => {
    for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ: ')
      expect(pixelFont.glyphs).toHaveProperty(ch);
  });

  it('lays out text with one column of tracking', () => {
    const t = pixelText('1:');
    expect(t.width).toBe(5 + 1 + 1);
    expect(t.cells).toContainEqual([6, 1]);
  });
});
