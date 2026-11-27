import { describe, expect, it } from 'vitest';
import {
  answerBanner,
  cardBanner,
  defaultCountdown,
  defaultLine,
  formatAge,
  formatCountdown,
  safeUrl,
} from '@/lib/format.js';
import { mkAnswer, mkDecision } from './factories.js';

const NOW = Date.parse('2026-11-25T12:01:00.000Z');

describe('formatCountdown', () => {
  it('renders m:ss', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(107_000)).toBe('1:47');
    expect(formatCountdown(60_000)).toBe('1:00');
  });
  it('never goes negative', () => {
    expect(formatCountdown(-5_000)).toBe('0:00');
  });
});

describe('formatAge', () => {
  it('uses seconds, minutes and hours by magnitude', () => {
    expect(formatAge(40)).toBe('40s');
    expect(formatAge(89)).toBe('89s');
    expect(formatAge(300)).toBe('5m');
    expect(formatAge(5_399)).toBe('90m');
    expect(formatAge(7_200)).toBe('2h');
  });
});

describe('answerBanner', () => {
  it('shows the undo countdown while the window is open', () => {
    expect(answerBanner(mkAnswer(), NOW)).toEqual({
      kind: 'undo',
      text: 'Sending in 1:00',
      canUndo: true,
    });
  });
  it('shows Sending when the window is over but not delivered', () => {
    const past = Date.parse('2026-11-25T12:03:00.000Z');
    expect(answerBanner(mkAnswer(), past)?.kind).toBe('sending');
    expect(answerBanner(mkAnswer({ status: 'delivering' }), past)?.kind).toBe('sending');
  });
  it('reports delivered, held, stale and failed', () => {
    expect(answerBanner(mkAnswer({ status: 'delivered' }), NOW)?.text).toBe('Sent');
    expect(answerBanner(mkAnswer({ status: 'dry_run' }), NOW)?.kind).toBe('held');
    expect(answerBanner(mkAnswer({ status: 'stale' }), NOW)?.text).toBe(
      'Changed since you looked. Not sent.',
    );
    expect(answerBanner(mkAnswer({ status: 'failed', error: 'rate limited' }), NOW)?.text).toBe(
      'rate limited',
    );
  });
  it('is null for no answer', () => {
    expect(answerBanner(null, NOW)).toBeNull();
  });
});

describe('cardBanner', () => {
  it('is null for a plain open decision', () => {
    expect(cardBanner(mkDecision(), NOW)).toBeNull();
  });
  it('delegates to the answer banner while answered', () => {
    expect(cardBanner(mkDecision({ answer: mkAnswer() }), NOW)?.kind).toBe('undo');
  });
  it('gives repair lines for the attention queue', () => {
    expect(
      cardBanner(mkDecision({ status: 'queued', status_reason: 'behind the migration' }), NOW),
    ).toEqual({ kind: 'held', text: 'behind the migration' });
    expect(cardBanner(mkDecision({ status: 'stale' }), NOW)?.kind).toBe('stale');
    expect(
      cardBanner(mkDecision({ status: 'failed', status_reason: '429 from the source' }), NOW)!.text,
    ).toBe('429 from the source');
    expect(cardBanner(mkDecision({ status: 'expired' }), NOW)?.kind).toBe('held');
    expect(cardBanner(mkDecision({ status: 'resolved_outside' }), NOW)?.text).toBe(
      'Resolved outside Nod',
    );
  });
});

describe('default countdown', () => {
  const d = mkDecision({
    default: { option: 'wait', deadline: '2026-11-25T12:18:00.000Z' },
  });
  it('counts down to the deadline', () => {
    expect(defaultCountdown(d, NOW)).toBe(17 * 60_000);
  });
  it('renders the "If you say nothing" line with the option label', () => {
    expect(defaultLine(d, NOW)).toBe('If you say nothing: Wait for QA, in 17:00');
  });
  it('is null without a default', () => {
    expect(defaultLine(mkDecision(), NOW)).toBeNull();
  });
});

describe('safeUrl', () => {
  it('only allows http(s)', () => {
    expect(safeUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(safeUrl('http://example.com/x')).toBe('http://example.com/x');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
  });
});
