import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { pixelLayout } from '../public/pixel.js';

const pub = new URL('../public/', import.meta.url);
const read = (f: string) => readFileSync(new URL(f, pub), 'utf8');

describe('service worker shell cache', () => {
  it('lists every file the inbox loads, so it opens offline', () => {
    const sw = read('sw.js');
    const cached = [...sw.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
    // Everything in public/ except the worker itself and the design reference page.
    const shell = readdirSync(pub)
      .filter((f) => f !== 'sw.js' && f !== 'index.html' && !f.startsWith('design.'))
      .map((f) => `/${f}`);
    for (const f of shell) expect(cached, f).toContain(f);
    expect(cached).toContain('/');
  });

  it('only references assets that exist', () => {
    const html = read('index.html');
    for (const [, href] of html.matchAll(/(?:href|src)="\/([^"#]+)"/g)) {
      expect(readdirSync(pub), href).toContain(href);
    }
  });
});

describe('pixelLayout', () => {
  it('lays out the clock in the 5x7 face with one column of tracking', () => {
    const t = pixelLayout('09:41');
    expect(t.height).toBe(7);
    expect(t.width).toBe(5 + 1 + 5 + 1 + 1 + 1 + 5 + 1 + 5);
    expect(t.cells.length).toBeGreaterThan(40);
  });

  it('upper-cases and renders unknown characters as space', () => {
    expect(pixelLayout('nod')).toEqual(pixelLayout('NOD'));
    expect(pixelLayout('~').cells).toEqual([]);
  });
});
