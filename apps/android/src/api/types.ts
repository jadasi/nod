/**
 * Client-side mirror of what `apps/core` returns on the device API (`/v1/*`).
 * The field shapes follow `DecisionView` in `apps/core/src/service.ts`; the
 * embedded request fields follow `DecisionRequest` in `@nod/contract`.
 * If core changes a shape, this file changes with it.
 */
import type { DecisionRequest } from '@nod/contract';

export type DecisionStatus =
  | 'queued'
  | 'open'
  | 'answered'
  | 'delivered'
  | 'withdrawn'
  | 'expired'
  | 'resolved_outside'
  | 'stale'
  | 'failed';

export type AnswerStatus =
  'pending' | 'delivering' | 'undone' | 'delivered' | 'stale' | 'failed' | 'dry_run';

export interface AnswerView {
  version: number;
  option_id: string | null;
  other_text: string | null;
  surface: string;
  status: AnswerStatus;
  answered_at: string;
  /** When the undo window ends and delivery may begin. Server time. */
  deliver_after: string;
  can_undo: boolean;
  error: string | null;
}

export interface DecisionView {
  id: string;
  status: DecisionStatus;
  status_reason: string | null;
  needs_david: boolean;
  waiting_on: string | null;
  source: DecisionRequest['source'];
  provenance: DecisionRequest['provenance'];
  glance: DecisionRequest['glance'];
  impact: string;
  options: DecisionRequest['options'];
  recommended: string;
  confidence?: number;
  default?: DecisionRequest['default'];
  urgency: string;
  risk: 'low' | 'write';
  allow_other: boolean;
  allow_call: boolean;
  resources: string[];
  evidence: NonNullable<DecisionRequest['evidence']>;
  tried?: string;
  created_at: string;
  freshness: { last_checked_at: string; age_seconds: number; stale: boolean };
  answer: null | AnswerView;
}

/** A row of the `updates` table (sweeps, digests, agent reports). */
export interface UpdateRow {
  id: number;
  system: string;
  kind: 'notify' | 'progress';
  level: 'info' | 'warn' | 'error';
  title: string;
  body: string | null;
  project: string | null;
  ref: string | null;
  url: string | null;
  created_at: string;
}

export interface StatusView {
  delivery_mode: 'live' | 'dry_run';
  undo_window_seconds: number;
  reconciler_interval_seconds: number;
}

/** One event on the SSE stream (`GET /v1/events`). */
export type NodEvent =
  { type: 'decision'; id: string; status: string } | { type: 'update'; id: number };

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get unauthorized(): boolean {
    return this.status === 401;
  }
}
