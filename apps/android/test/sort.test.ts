import { describe, expect, it } from 'vitest';
import { needsYou, sortInbox } from '@/lib/sort.js';
import { mkDecision } from './factories.js';

describe('sortInbox', () => {
  it('puts urgent first, then oldest first', () => {
    const a = mkDecision({ id: 'a', urgency: 'normal', created_at: '2026-11-25T09:00:00Z' });
    const b = mkDecision({ id: 'b', urgency: 'urgent', created_at: '2026-11-25T12:00:00Z' });
    const c = mkDecision({ id: 'c', urgency: 'normal', created_at: '2026-11-25T08:00:00Z' });
    expect(sortInbox([a, b, c]).map((d) => d.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input', () => {
    const list = [
      mkDecision({ id: 'a', urgency: 'normal', created_at: '2026-11-25T09:00:00Z' }),
      mkDecision({ id: 'b', urgency: 'urgent', created_at: '2026-11-25T12:00:00Z' }),
    ];
    const snapshot = list.map((d) => d.id);
    sortInbox(list);
    expect(list.map((d) => d.id)).toEqual(snapshot);
  });
});

describe('needsYou', () => {
  it('is open decisions without an answer', () => {
    expect(needsYou(mkDecision())).toBe(true);
    expect(needsYou(mkDecision({ status: 'answered' }))).toBe(false);
  });
});
