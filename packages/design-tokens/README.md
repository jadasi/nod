# @nod/design-tokens — "Phosphor"

Nod's design system in one place, so the web inbox, the Android app and the Even G2 glasses app look like one product: phosphor green on near-black, thin outlined panels with corner ticks, square corners, a dot-matrix display face for short labels and a legible monospace for everything you read.

Reference page: open `/design.html` on any running `nod-core` (no token needed, no data shown).

## Sources (edit these)

| File              | What                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.json`     | Colour, contrast pairs, type scale, pixel-font scales, 4px spacing grid, borders, radius (always 0), control sizes, motion, effects, glasses levels |
| `icons.json`      | 24 original 12x12 pixel icons, plus the 24x24 app icon, drawn as `#`/`.` grids                                                                      |
| `pixel-font.json` | **Nod Pixel 5x7**, an original dot-matrix display face (digits, A–Z, a little punctuation). Display only: never running text                        |

Then run:

```
pnpm --filter @nod/design-tokens generate
```

## Outputs (generated, committed, do not edit)

| File                                | Used by                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/public/tokens.css`        | Web inbox: `--color-*`, `--type-*`, `--space-*`, … and `.icon .icon-<name>` classes                                             |
| `apps/web/public/tokens.js`         | Web inbox: the pixel font and token values for scripts                                                                          |
| `apps/web/public/icon.svg`          | App icon / favicon                                                                                                              |
| `src/generated.ts` → `src/index.ts` | Android (Expo) and glasses (TS): `tokens`, `icons` (rows + SVG path), `pixelFont`, `contrastRatio`, `pixelText`, `glassesLevel` |
| `icons/*.svg`                       | One crisp 24px SVG per icon (`shape-rendering="crispEdges"`, `fill="currentColor"`)                                             |

The tests fail if any generated file is out of date, if an icon is not a clean 12x12 grid, or if any contrast pair in `tokens.json` drops below WCAG AA (4.5:1 text, 3:1 control outlines and focus ring).

## Rules of use

- **Body text is monospace** (`--font-body`, system fonts only, nothing downloaded). The pixel face is for the wordmark, clock, counts and short headings, always with the same words available to screen readers.
- **Icons render at 12, 24 or 48 px** (whole multiples of the grid) so pixels stay sharp. They inherit `currentColor` and are decorative: a text label always carries the meaning.
- `line` is decorative only. Anything you can click or type in is outlined with `lineStrong` or brighter.
- Glow and scanlines are cosmetic and switch off under `prefers-reduced-motion` and `prefers-contrast: more`.

## Android (Expo / React Native)

```ts
import { tokens, icons, color } from '@nod/design-tokens';
// <Svg viewBox="0 0 12 12" width={24} height={24} shapeRendering="crispEdges">
//   <Path d={icons.check.path} fill={color('phosphor')} />
// </Svg>
```

## Glasses (Even G2, 576×288 monochrome green)

The G2 draws one hue at a few brightness levels, so colour tokens map to a brightness level 0–15 (`tokens.glasses.level`, read with `glassesLevel(name)`); `bg` and `surface` are 0 (off, i.e. see-through). Anything the web says with hue has to be said another way on the glasses:

- **Urgent** (red on the web): inverted badge, level-15 fill with the text cut out, plus the `alert` icon.
- **Caution** (amber: external sender, writes, dry-run): outlined badge plus the `mail` or `write` icon.
- **Recommended / default on silence**: `star` icon and the default highlight; the default option gets the draining countdown ring.
- **Focus** (ring selection): the same 2px outline at level 15 as the web focus ring.

Icons and the pixel font are 1-bit grids, so they draw straight onto the glasses framebuffer (`icons.<name>.rows`, `pixelText()` cells) at integer scales. The level numbers are a starting point: confirm the panel's real bit depth against the Even Hub SDK simulator before relying on more than ~4 distinct levels.
