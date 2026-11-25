/**
 * Renders the Nod app icon (the 24x24 pixel grid in @nod/design-tokens,
 * `app`) to the PNGs `app.json` references. Dependency-free: a small PNG
 * encoder on top of node:zlib. Re-run after the token grid changes:
 * `pnpm --filter @nod/android make-icons`.
 */
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import process from 'node:process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { app } = JSON.parse(
  readFileSync(join(root, '../../packages/design-tokens/icons.json'), 'utf8'),
);
const rows = app.rows;
const cells = rows.length;

// ---- minimal PNG writer ----------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- grid -> RGBA ----------------------------------------------------------

function hex(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/**
 * Draws the grid into an RGBA buffer. `contentScale` shrinks the grid for the
 * adaptive-icon safe zone; `ink`/`accent` are lit-cell colours, `bg` the rest
 * (pass alpha 0 for transparent).
 */
function render(size, { contentScale = 1, bg = [18, 19, 20, 255], ink, accent }) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b, a] = bg;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  const gridPx = size * contentScale;
  const ox = (size - gridPx) / 2;
  const oy = (size - gridPx) / 2;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < rows[cy].length; cx++) {
      const ch = rows[cy][cx];
      if (ch === '.') continue;
      const col = ch === '+' ? accent : ink;
      const x0 = Math.floor(ox + (cx / cells) * gridPx);
      const y0 = Math.floor(oy + (cy / cells) * gridPx);
      const x1 = Math.ceil(ox + ((cx + 1) / cells) * gridPx);
      const y1 = Math.ceil(oy + ((cy + 1) / cells) * gridPx);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * size + x) * 4;
          rgba[i] = col[0];
          rgba[i + 1] = col[1];
          rgba[i + 2] = col[2];
          rgba[i + 3] = 255;
        }
    }
  }
  return rgba;
}

// Phosphor dark palette (packages/design-tokens/tokens.json, dark theme).
const DARK_BG = '#121314';
const INK = '#5dff8a';

const assets = join(root, 'assets');
mkdirSync(assets, { recursive: true });

const targets = [
  // App icon: full-bleed, the grid fills the canvas.
  ['icon.png', 1024, { bg: hex(DARK_BG).concat(255), ink: hex(INK), accent: hex(INK) }],
  // Splash: transparent, phosphor ink.
  ['splash-icon.png', 512, { bg: [0, 0, 0, 0], ink: hex(INK), accent: hex(INK) }],
  // Adaptive foreground: content inside the 72/108 safe zone.
  [
    'android-icon-foreground.png',
    432,
    { contentScale: 72 / 108, bg: [0, 0, 0, 0], ink: hex(INK), accent: hex(INK) },
  ],
  // Adaptive monochrome: solid white ink (Android tints it).
  [
    'android-icon-monochrome.png',
    432,
    { contentScale: 72 / 108, bg: [0, 0, 0, 0], ink: [255, 255, 255], accent: [255, 255, 255] },
  ],
];

for (const [name, size, opts] of targets) {
  writeFileSync(join(assets, name), encodePng(size, render(size, opts)));
  process.stdout.write(`assets/${name} (${size}x${size})\n`);
}
