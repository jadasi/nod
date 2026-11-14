# @nod/design-tokens — "Phosphor"

Nod's design system in one place, so the web inbox, the Android app and the Even G2 glasses app look like one product. It is gray monochrome in two themes (dark gray and very light gray), with phosphor green kept as a strong accent for what must stand out. Corners are square. Body text is set in Space Grotesk, short display labels in an original dot-matrix face, and icons and illustrations are pixel art.

Reference page: open `/design.html` on any running `nod-core` (no token needed, no data shown). It shows both themes side by side.

## Themes and the green accent

`tokens.json` → `themes.dark` / `themes.light` hold the same semantic colour names. The web follows `prefers-color-scheme`; the HUD toggle overrides it (system → light → dark, stored in the browser). Green is only for:

- the logo/wordmark and the app icon;
- primary actions (`accent` fill with `onAccent` text): approve, send, sign in;
- high-visibility status (`accentInk`): live connection, waiting count, undo countdown and meter, "Answered";
- the focus ring.

Everything else (text, panels, borders, tags, secondary buttons, nav) is gray. Amber and red stay for caution and urgent/danger. In light mode `accentInk` is a deeper green (`#0a7a35`) so it passes AA as text; `accent` stays bright as a fill.

## Emphasis rules

Pixel effects mark action and interaction; they are not a default skin.

- **Plain panels** are clean gray outlines.
- **Action items** (decisions that need an answer, the undo bar, sign-in) get accent corner brackets; the undo bar also gets scanlines. Urgent action items get red brackets and a red edge.
- **Hover and keyboard focus** on cards and buttons add scanlines (and brackets on cards) instead of a solid fill.
- **Display**: the big clock is dot matrix with faint scanlines; the wordmark and waiting count glow in the dark theme.
- Under `prefers-reduced-motion` or `prefers-contrast: more`, scanlines and glow switch off and hover falls back to a plain fill.

## Sources (edit these)

| File              | What                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.json`     | Colour names and two themes, contrast pairs, fonts, type scale, pixel-font scales, 4px spacing grid, borders, radius (always 0), control sizes, motion, emphasis rules, glasses levels |
| `icons.json`      | 24 original 12x12 pixel icons, plus the 24x24 app icon, drawn as `#`/`.` grids                                                                                                         |
| `pixel-font.json` | **Nod Pixel 5x7**, an original dot-matrix display face (digits, A–Z, a little punctuation). Display only: never running text                                                           |

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

The tests fail if any generated file is out of date, if an icon or illustration grid is malformed, if a theme is missing a colour, or if any contrast pair drops below WCAG AA in either theme (4.5:1 text, 3:1 control outlines and focus ring).

## Rules of use

- **Body text is Space Grotesk** (SIL OFL 1.1, self-hosted variable woff2 in `apps/web/public/fonts/` with `OFL.txt`; no font CDN). It is a clean grotesque with quirky, slightly technical details (it grew out of Space Mono), so it keeps character next to the pixel face while staying easy to read. Technical evidence uses the system monospace. The pixel face is for the wordmark, clock, counts and short headings, always with the same words available to screen readers.
- **Icons render at 12, 24 or 48 px** (whole multiples of the grid) so pixels stay sharp. They inherit `currentColor` and are decorative: a text label always carries the meaning.
- `line` is decorative only. Anything you can click or type in is outlined with `lineStrong` or brighter.
- Glow and scanlines are cosmetic and switch off under `prefers-reduced-motion` and `prefers-contrast: more`.

## Android (Expo / React Native)

```ts
import { tokens, icons, illustrations, color } from '@nod/design-tokens';
// <Svg viewBox="0 0 12 12" width={24} height={24} shapeRendering="crispEdges">
//   <Path d={icons.check.path} fill={color('accentInk', scheme)} />  // scheme: 'dark' | 'light'
// </Svg>
```

## Glasses (Even G2, 576×288 monochrome green)

The G2 draws one hue at a few brightness levels, so the glasses use the dark theme and its colour tokens map to a brightness level 0–15 (`tokens.glasses.level`, read with `glassesLevel(name)`); `bg` and `surface` are 0 (off, i.e. see-through). Anything the web says with hue has to be said another way on the glasses:

- **Urgent** (red on the web): inverted badge, level-15 fill with the text cut out, plus the `alert` icon.
- **Caution** (amber: external sender, writes, dry-run): outlined badge plus the `mail` or `write` icon.
- **Recommended / default on silence**: `star` icon and the default highlight; the default option gets the draining countdown ring.
- **Focus** (ring selection): the same 2px outline at level 15 as the web focus ring.

Icons and the pixel font are 1-bit grids, so they draw straight onto the glasses framebuffer (`icons.<name>.rows`, `pixelText()` cells) at integer scales. The level numbers are a starting point: confirm the panel's real bit depth against the Even Hub SDK simulator before relying on more than ~4 distinct levels.
