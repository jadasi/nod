import type { AnswerView, DecisionView, UpdateRow } from '@/api/types.js';

/** A minimal open decision; tests override what they care about. */
export function mkDecision(over: Partial<DecisionView> = {}): DecisionView {
  return {
    id: 'dec-1',
    status: 'open',
    status_reason: null,
    needs_david: true,
    waiting_on: null,
    source: { system: 'paperclip', ref: 'BYT-1' },
    provenance: { kind: 'internal' },
    glance: { title: 'Ship the fix', question: 'Merge now or wait for QA?' },
    impact: 'Users see the fix earlier.',
    options: [
      { id: 'merge', label: 'Merge', outcome: 'Ships now.', reversible: true, writes: true },
      {
        id: 'wait',
        label: 'Wait for QA',
        outcome: 'Ships after QA.',
        reversible: true,
        writes: false,
      },
    ],
    recommended: 'merge',
    urgency: 'normal',
    risk: 'write',
    allow_other: true,
    allow_call: false,
    resources: [],
    evidence: [],
    created_at: '2026-11-25T12:00:00.000Z',
    freshness: { last_checked_at: '2026-11-25T12:00:00.000Z', age_seconds: 10, stale: false },
    answer: null,
    ...over,
  };
}

export function mkAnswer(over: Partial<AnswerView> = {}): AnswerView {
  return {
    version: 1,
    option_id: 'merge',
    other_text: null,
    surface: 'android',
    status: 'pending',
    answered_at: '2026-11-25T12:00:00.000Z',
    deliver_after: '2026-11-25T12:02:00.000Z',
    can_undo: true,
    error: null,
    ...over,
  };
}

export function mkUpdate(over: Partial<UpdateRow> = {}): UpdateRow {
  return {
    id: 1,
    system: 'paperclip',
    kind: 'notify',
    level: 'info',
    title: 'Sweep finished',
    body: 'All clear.',
    project: 'web-app',
    ref: null,
    url: null,
    created_at: '2026-11-25T12:00:00.000Z',
    ...over,
  };
}
