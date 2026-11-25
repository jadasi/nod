import { describe, expect, it } from 'vitest';
import {
  activeRecords,
  answerLabel,
  expiredRecords,
  meterFraction,
  pendingRecordFromDecision,
  reconcileRecords,
  remainingMs,
  removeRecord,
  stillUndoable,
  upsertRecord,
  type PendingAnswerRecord,
} from '@/lib/undo.js';
import { mkAnswer, mkDecision } from './factories.js';

const T0 = Date.parse('2026-11-25T12:00:00.000Z');
const T1 = Date.parse('2026-11-25T12:02:00.000Z');
const ISO = (t: number): string => new Date(t).toISOString();

const rec = (over: Partial<PendingAnswerRecord> = {}): PendingAnswerRecord => ({
  decisionId: 'dec-1',
  deliverAfter: ISO(T1),
  answeredAt: ISO(T0),
  label: 'Merge',
  ...over,
});

describe('remainingMs', () => {
  it('is deliver_after minus now, clamped at 0', () => {
    expect(remainingMs(ISO(T1), T0 + 60_000)).toBe(60_000);
    expect(remainingMs(ISO(T1), T1 + 5_000)).toBe(0);
  });
});

describe('meterFraction', () => {
  it('drains 1 -> 0 across the window', () => {
    expect(meterFraction(ISO(T0), ISO(T1), T0)).toBe(1);
    expect(meterFraction(ISO(T0), ISO(T1), T0 + 60_000)).toBe(0.5);
    expect(meterFraction(ISO(T0), ISO(T1), T1)).toBe(0);
  });
  it('clamps and reads 0 for a zero-length window', () => {
    expect(meterFraction(ISO(T0), ISO(T1), T1 + 1_000)).toBe(0);
    expect(meterFraction(ISO(T0), ISO(T1), T0 - 1_000)).toBe(1);
    expect(meterFraction(ISO(T0), ISO(T0), T0)).toBe(0);
  });
});

describe('active / expired records', () => {
  it('splits on the window end', () => {
    const open = rec({ decisionId: 'a', deliverAfter: ISO(T1) });
    const past = rec({ decisionId: 'b', deliverAfter: ISO(T0) });
    const now = T0 + 30_000;
    expect(activeRecords([open, past], now).map((r) => r.decisionId)).toEqual(['a']);
    expect(expiredRecords([open, past], now).map((r) => r.decisionId)).toEqual(['b']);
  });
});

describe('upsert / remove', () => {
  it('keeps one record per decision', () => {
    const base = [rec({ decisionId: 'a' }), rec({ decisionId: 'b' })];
    const next = upsertRecord(base, rec({ decisionId: 'a', label: 'Wait for QA' }));
    expect(next.map((r) => r.decisionId)).toEqual(['b', 'a']);
    expect(next.find((r) => r.decisionId === 'a')?.label).toBe('Wait for QA');
    expect(removeRecord(base, 'a').map((r) => r.decisionId)).toEqual(['b']);
  });
});

describe('reconcileRecords', () => {
  it('keeps open windows and clears ended ones', () => {
    const open = rec({ decisionId: 'a', deliverAfter: ISO(T1) });
    const past = rec({ decisionId: 'b', deliverAfter: ISO(T0) });
    const { keep, toClear } = reconcileRecords([open, past], T0 + 30_000);
    expect(keep.map((r) => r.decisionId)).toEqual(['a']);
    expect(toClear).toEqual(['b']);
  });
});

describe('live decision helpers', () => {
  it('answerLabel prefers the option label, then the Other text', () => {
    const d = mkDecision({ answer: mkAnswer() });
    expect(answerLabel(d, d.answer!)).toBe('Merge');
    const other = mkDecision({
      answer: mkAnswer({ option_id: null, other_text: 'Just ship it' }),
    });
    expect(answerLabel(other, other.answer!)).toBe('Just ship it');
  });

  it('pendingRecordFromDecision mirrors the live answer', () => {
    const d = mkDecision({ answer: mkAnswer() });
    expect(pendingRecordFromDecision(d)).toEqual({
      decisionId: 'dec-1',
      deliverAfter: ISO(T1),
      answeredAt: ISO(T0),
      label: 'Merge',
    });
    expect(pendingRecordFromDecision(mkDecision())).toBeNull();
    expect(
      pendingRecordFromDecision(mkDecision({ answer: mkAnswer({ can_undo: false }) })),
    ).toBeNull();
  });

  it('stillUndoable needs the server to agree and the clock to allow it', () => {
    const d = mkDecision({ answer: mkAnswer() });
    expect(stillUndoable(d, T0 + 30_000)).toBe(true);
    expect(stillUndoable(d, T1 + 1_000)).toBe(false);
    expect(stillUndoable(mkDecision(), T0)).toBe(false);
  });
});
