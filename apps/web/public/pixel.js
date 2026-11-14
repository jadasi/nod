// Draws short display text (wordmark, clock, counts, headings) in the Nod Pixel 5x7 face as SVG.
// Display only: the SVG is aria-hidden, so callers must also provide the text to assistive tech.
import { GLYPHS, HEIGHT } from './tokens.js';

const SVG = 'http://www.w3.org/2000/svg';

/** Lit cells for `text`, in grid units. Pure, so it is unit tested. */
export function pixelLayout(text) {
  const cells = [];
  let x = 0;
  for (const ch of String(text).toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    g.forEach((row, y) => [...row].forEach((c, i) => c === '#' && cells.push([x + i, y])));
    x += g[0].length + 1;
  }
  return { width: Math.max(0, x - 1), height: HEIGHT, cells };
}

/**
 * An inline SVG of `text`. `scale` is CSS px per cell; `dot` < 1 leaves gaps between cells for a
 * dot-matrix look (use it only at large scales, where the gaps stay legible).
 */
export function pixelSvg(text, { scale = 2, dot = 1, className = 'pixel' } = {}) {
  const { width, height, cells } = pixelLayout(text);
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('width', String(width * scale));
  el.setAttribute('height', String(height * scale));
  el.setAttribute('shape-rendering', 'crispEdges');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  el.setAttribute('class', className);
  const inset = (1 - dot) / 2;
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute(
    'd',
    cells.map(([x, y]) => `M${x + inset} ${y + inset}h${dot}v${dot}h-${dot}z`).join(''),
  );
  path.setAttribute('fill', 'currentColor');
  el.append(path);
  return el;
}

/** Puts pixel text into `host`, with the same words available to screen readers. */
export function setPixelText(host, text, opts) {
  if (!host || host.dataset.pixel === String(text)) return;
  host.dataset.pixel = String(text);
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = String(text);
  host.replaceChildren(pixelSvg(text, opts), sr);
}
