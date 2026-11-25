import { describe, expect, it } from 'vitest';
import {
  BUDGET,
  CHANNELS,
  fitBudget,
  planForDecision,
  planForUpdate,
} from '@/lib/notifications.js';
import { isOpenNow } from '@/lib/hours.js';
import { mkAnswer, mkDecision, mkUpdate } from './factories.js';

const OPEN = Date.parse('2026-01-15T16:00:00.000Z'); // 9:00 Phoenix (open)
const MIDNIGHT = Date.parse('2026-01-15T13:00:00.000Z'); // 6:00 Phoenix (closed)

describe('channels', () => {
  it('are exactly the five settled channels', () => {
    expect(CHANNELS.map((c) => c.id)).toEqual([
      'urgent',
      'decisions',
      'sending',
      'updates',
      'problems',
    ]);
    expect(new Set(CHANNELS.map((c) => c.id)).size).toBe(CHANNELS.length);
  });
});

describe('fitBudget', () => {
  it('leaves short text alone and cuts long text with an ellipsis', () => {
    expect(fitBudget('Ship it', BUDGET.title)).toBe('Ship it');
    const long = 'x'.repeat(BUDGET.title + 10);
    const fit = fitBudget(long, BUDGET.title);
    expect(fit.length).toBe(BUDGET.title);
    expect(fit.endsWith('…')).toBe(true);
  });

  it('cuts on a word boundary so the lenses never show half a word', () => {
    const long = 'Approve the quarterly infrastructure budget increase for the billing cluster';
    const fit = fitBudget(long, BUDGET.title);
    expect(fit.length).toBeLessThanOrEqual(BUDGET.title);
    expect(fit).toBe('Approve the quarterly infrastructure budget…');
  });

  it('falls back to a hard cut when the nearest boundary is too far back', () => {
    const fit = fitBudget(`short ${'x'.repeat(60)}`, BUDGET.title);
    expect(fit.length).toBe(BUDGET.title);
    expect(fit.endsWith('…')).toBe(true);
  });
});

describe('planForDecision', () => {
  it('alerts urgent any hour, with top-2 options plus Open for internal', () => {
    const d = mkDecision({
      urgency: 'urgent',
      options: [
        { id: 'a', label: 'Alpha option', outcome: '', reversible: true, writes: false },
        { id: 'b', label: 'Beta option', outcome: '', reversible: true, writes: false },
        { id: 'c', label: 'Gamma option', outcome: '', reversible: true, writes: false },
      ],
    });
    d.recommended = 'b';
    const plan = planForDecision(d, { now: MIDNIGHT, glassesMirror: false })!;
    expect(plan.channelId).toBe('urgent');
    expect(plan.actions.map((a) => a.id)).toEqual(['answer:b', 'answer:a', 'open']);
  });

  it('keeps normal decisions silent outside open hours', () => {
    expect(planForDecision(mkDecision(), { now: MIDNIGHT, glassesMirror: false })).toBeNull();
    expect(planForDecision(mkDecision(), { now: OPEN, glassesMirror: false })?.channelId).toBe(
      'decisions',
    );
  });

  it('never gives external provenance an inline answer', () => {
    const d = mkDecision({ provenance: { kind: 'external', origin: 'sales@acme.com' } });
    const plan = planForDecision(d, { now: OPEN, glassesMirror: false })!;
    expect(plan.actions.map((a) => a.id)).toEqual(['open']);
    expect(plan.actions[0]?.title).toBe('Review in Nod');
    expect(plan.body).toContain('Nod never answers this for you');
  });

  it('posts a high-priority glasses plan within the budget when the mirror is on', () => {
    const d = mkDecision({
      glance: {
        title: 'T'.repeat(80),
        question: 'Q'.repeat(200),
      },
    });
    const plan = planForDecision(d, { now: MIDNIGHT, glassesMirror: true })!;
    expect(plan.channelId).toBe('urgent');
    expect(plan.title.length).toBeLessThanOrEqual(BUDGET.title);
    expect(plan.body.length).toBeLessThanOrEqual(BUDGET.question);
    expect(plan.data.onGlasses).toBe(true);
  });

  it('surfaces a pending answer as the Sending plan with Undo, any hour', () => {
    const d = mkDecision({ answer: mkAnswer() });
    const now = Date.parse('2026-11-25T12:01:00.000Z');
    const plan = planForDecision(d, { now, glassesMirror: false })!;
    expect(plan.channelId).toBe('sending');
    expect(plan.actions.map((a) => a.id)).toEqual(['undo']);
    expect(plan.progress).toBeCloseTo(0.5);
    expect(plan.body).toContain('“Merge”');
  });

  it('reports stale and failed answers on the problems channel in open hours only', () => {
    const d = mkDecision({ answer: mkAnswer({ status: 'stale' }) });
    expect(planForDecision(d, { now: OPEN, glassesMirror: false })?.channelId).toBe('problems');
    expect(planForDecision(d, { now: MIDNIGHT, glassesMirror: false })).toBeNull();
  });
});

describe('planForUpdate', () => {
  it('posts notify updates in open hours and stays silent otherwise', () => {
    expect(isOpenNow(OPEN)).toBe(true);
    const plan = planForUpdate(mkUpdate(), { now: OPEN, glassesMirror: false })!;
    expect(plan.channelId).toBe('updates');
    expect(planForUpdate(mkUpdate(), { now: MIDNIGHT, glassesMirror: false })).toBeNull();
    expect(
      planForUpdate(mkUpdate({ kind: 'progress' }), { now: OPEN, glassesMirror: false }),
    ).toBeNull();
  });
});
