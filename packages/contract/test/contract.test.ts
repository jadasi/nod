import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { validateDecisionRequest } from '../src/index.js';

const load = (dir: string) =>
  readdirSync(new URL(`../fixtures/${dir}/`, import.meta.url)).map((f) => ({
    name: f,
    json: JSON.parse(readFileSync(new URL(`../fixtures/${dir}/${f}`, import.meta.url), 'utf8')),
  }));

describe('decision contract fixtures', () => {
  for (const f of load('valid')) {
    it(`accepts ${f.name}`, () => {
      const r = validateDecisionRequest(f.json);
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }
  for (const f of load('invalid')) {
    it(`rejects ${f.name}`, () => {
      expect(validateDecisionRequest(f.json).ok).toBe(false);
    });
  }
});

describe('derived risk', () => {
  const base = load('valid').find((f) => f.name === 'minimal.json')!.json;
  it('is write when any option writes', () => {
    expect(validateDecisionRequest(base).risk).toBe('write');
  });
  it('is low when no option writes', () => {
    const copy = structuredClone(base);
    for (const o of copy.options) o.writes = false;
    expect(validateDecisionRequest(copy).risk).toBe('low');
  });
});
