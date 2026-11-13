import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import * as lib from '../public/lib.js';

describe('formatCountdown', () => {
  it('formats the undo window like "1:47"', () => {
    expect(lib.formatCountdown(107_000)).toBe('1:47');
    expect(lib.formatCountdown(120_000)).toBe('2:00');
    expect(lib.formatCountdown(900)).toBe('0:00');
    expect(lib.formatCountdown(-5)).toBe('0:00');
  });
});

describe('answerBanner', () => {
  const base = {
    version: 1,
    option_id: 'a',
    other_text: null,
    surface: 'web',
    answered_at: '2026-11-13T18:00:00Z',
    deliver_after: '2026-11-13T18:02:00Z',
    can_undo: true,
    error: null,
  };
  const t = (s: string) => new Date(s).getTime();

  it('counts down while the undo window is open', () => {
    const b = lib.answerBanner({ ...base, status: 'pending' }, t('2026-11-13T18:00:13Z'));
    expect(b).toEqual({ kind: 'undo', text: 'Sending in 1:47', canUndo: true });
  });

  it('stops offering undo once the window has elapsed', () => {
    const b = lib.answerBanner({ ...base, status: 'pending' }, t('2026-11-13T18:02:01Z'));
    expect(b.canUndo).toBe(false);
  });

  it('says plainly when nothing was written', () => {
    expect(lib.answerBanner({ ...base, status: 'dry_run' }, 0).kind).toBe('held');
    expect(lib.answerBanner({ ...base, status: 'stale' }, 0).text).toMatch(/Changed since/);
  });

  it('shows nothing without an answer', () => {
    expect(lib.answerBanner(null, 0)).toBeNull();
  });
});

describe('createSseParser', () => {
  it('handles events split across chunks and ignores keepalives', () => {
    const parse = lib.createSseParser();
    expect(parse('event: ready\ndata: {}\n')).toEqual([]);
    expect(parse('\n: keepalive\n\nevent: decision\ndata: {"id":"x"}\n\n')).toEqual([
      { event: 'ready', data: '{}' },
      { event: 'decision', data: '{"id":"x"}' },
    ]);
  });
});

describe('sortInbox', () => {
  it('puts urgent first, then oldest first', () => {
    const out = lib.sortInbox([
      { id: 'b', urgency: 'normal', created_at: '2026-11-13T10:00:00Z' },
      { id: 'c', urgency: 'urgent', created_at: '2026-11-13T12:00:00Z' },
      { id: 'a', urgency: 'normal', created_at: '2026-11-13T09:00:00Z' },
    ]);
    expect(out.map((d: { id: string }) => d.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('safeUrl', () => {
  it('only allows http(s)', () => {
    expect(lib.safeUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(lib.safeUrl('javascript:alert(1)')).toBeNull();
    expect(lib.safeUrl('nope')).toBeNull();
  });
});
