import { validateDecisionRequest, type DecisionRequest } from '@nod/contract';
import type pg from 'pg';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { NodError } from './errors.js';
import { emit } from './events.js';
import type { AdapterRegistry, SourceRef, SourceState } from './source.js';

export type Surface =
  'web' | 'android' | 'glasses' | 'call' | 'default' | 'rule' | 'agent' | 'system';

/** Surfaces where David himself made the choice. Everything else is automatic. */
export const HUMAN_SURFACES: readonly Surface[] = ['web', 'android', 'glasses', 'call'];
const AUTOMATIC_SURFACES: readonly Surface[] = ['default', 'rule'];

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

/** Statuses in which a decision holds its resource locks. */
const HOLDING: DecisionStatus[] = ['open', 'answered', 'stale', 'failed'];

interface DecisionRow {
  id: string;
  source_system: string;
  source_ref: string;
  request: DecisionRequest;
  risk: 'low' | 'write';
  provenance_kind: 'internal' | 'external';
  urgency: string;
  status: DecisionStatus;
  status_reason: string | null;
  needs_david: boolean;
  waiting_on: string | null;
  fingerprint: string;
  last_checked_at: Date;
  last_heartbeat_at: Date;
  expires_at: Date;
  deadline_at: Date | null;
  answer_version: number;
  created_at: Date;
  updated_at: Date;
}

interface AnswerRow {
  id: string;
  decision_id: string;
  version: number;
  option_id: string | null;
  other_text: string | null;
  surface: Surface;
  status: 'pending' | 'delivering' | 'undone' | 'delivered' | 'stale' | 'failed' | 'dry_run';
  idempotency_key: string;
  answered_at: Date;
  deliver_after: Date;
  next_attempt_at: Date;
  attempts: number;
  last_error: string | null;
  fingerprint_at_answer: string;
  delivered_at: Date | null;
  delivered_fingerprint: string | null;
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
  confidence?: number | undefined;
  default?: DecisionRequest['default'];
  urgency: string;
  risk: 'low' | 'write';
  allow_other: boolean;
  allow_call: boolean;
  resources: string[];
  evidence: NonNullable<DecisionRequest['evidence']>;
  tried?: string | undefined;
  created_at: string;
  freshness: { last_checked_at: string; age_seconds: number; stale: boolean };
  answer: null | {
    version: number;
    option_id: string | null;
    other_text: string | null;
    surface: Surface;
    status: AnswerRow['status'];
    answered_at: string;
    /** When the undo window ends and delivery may begin. */
    deliver_after: string;
    can_undo: boolean;
    error: string | null;
  };
}

export type AwaitState =
  | 'waiting'
  | 'delivered'
  | 'stale'
  | 'reask'
  | 'failed'
  | 'withdrawn'
  | 'expired'
  | 'resolved_outside';

export interface AwaitResult {
  decision_id: string;
  state: AwaitState;
  reason?: string | undefined;
  answer?: {
    option_id: string | null;
    other_text: string | null;
    delivered_at: string;
    /** The fingerprint the answer was checked against. Verify your preconditions with it. */
    fingerprint: string;
  };
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface AnswerInput {
  option_id?: string | undefined;
  other_text?: string | undefined;
  surface: Surface;
}

export interface UpdateInput {
  kind: 'notify' | 'progress';
  level?: 'info' | 'warn' | 'error' | undefined;
  title: string;
  body?: string | undefined;
  project?: string | undefined;
  ref?: string | undefined;
  url?: string | undefined;
}

const sec = (n: number): number => n * 1000;

export class DecisionService {
  constructor(
    private readonly db: Db,
    private readonly adapters: AdapterRegistry,
    readonly config: Config,
    private readonly clock: Clock = systemClock,
  ) {}

  // ---------------------------------------------------------------- helpers

  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (err) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      c.release();
    }
  }

  private async audit(
    c: pg.PoolClient,
    decisionId: string | null,
    event: string,
    surface: Surface,
    detail: Record<string, unknown> = {},
    at: Date = this.clock.now(),
  ): Promise<void> {
    await c.query(
      'INSERT INTO audit_log (decision_id, event, surface, detail, at) VALUES ($1, $2, $3, $4, $5)',
      [decisionId, event, surface, JSON.stringify(detail), at],
    );
  }

  private async lockRow(c: pg.PoolClient, id: string): Promise<DecisionRow> {
    const { rows } = await c.query<DecisionRow>(
      'SELECT * FROM decisions WHERE id = $1 FOR UPDATE',
      [id],
    );
    const row = rows[0];
    if (!row) throw new NodError('not_found', 'No such decision');
    return row;
  }

  private async setStatus(
    c: pg.PoolClient,
    id: string,
    status: DecisionStatus,
    reason: string | null,
    extra: { needsDavid?: boolean | undefined } = {},
  ): Promise<void> {
    await c.query(
      `UPDATE decisions SET status = $2, status_reason = $3, updated_at = $4,
              needs_david = COALESCE($5, needs_david)
       WHERE id = $1`,
      [id, status, reason, this.clock.now(), extra.needsDavid ?? null],
    );
    await emit(c, { type: 'decision', id, status });
  }

  /** Frees a closed decision's locks and lets the next queued decision on them proceed. */
  private async releaseAndPromote(c: pg.PoolClient, id: string): Promise<void> {
    await c.query('DELETE FROM resource_locks WHERE decision_id = $1', [id]);
    const { rows } = await c.query<DecisionRow>(
      `SELECT * FROM decisions WHERE status = 'queued' AND waiting_on = $1
       ORDER BY seq FOR UPDATE`,
      [id],
    );
    for (const q of rows) {
      const resources = q.request.resources ?? [];
      const holder = await this.findHolder(c, resources, q.id);
      if (holder) {
        await c.query('UPDATE decisions SET waiting_on = $2 WHERE id = $1', [q.id, holder]);
        continue;
      }
      await this.acquire(c, q.id, resources);
      const now = this.clock.now();
      await c.query(
        `UPDATE decisions SET status = 'open', waiting_on = NULL, status_reason = NULL,
                expires_at = $2, last_heartbeat_at = $3, updated_at = $3 WHERE id = $1`,
        [q.id, new Date(now.getTime() + sec(q.request.ttl_seconds)), now],
      );
      await this.audit(c, q.id, 'promoted', 'system', { after: id });
      await emit(c, { type: 'decision', id: q.id, status: 'open' });
    }
  }

  private async findHolder(
    c: pg.PoolClient,
    resources: string[],
    exceptId: string | null,
  ): Promise<string | null> {
    if (resources.length === 0) return null;
    const { rows } = await c.query<{ decision_id: string }>(
      `SELECT l.decision_id FROM resource_locks l JOIN decisions d ON d.id = l.decision_id
       WHERE l.resource = ANY($1) AND d.status = ANY($2) AND l.decision_id IS DISTINCT FROM $3
       ORDER BY d.seq LIMIT 1`,
      [resources, HOLDING, exceptId],
    );
    return rows[0]?.decision_id ?? null;
  }

  private async acquire(c: pg.PoolClient, id: string, resources: string[]): Promise<void> {
    for (const r of resources) {
      await c.query(
        'INSERT INTO resource_locks (resource, decision_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [r, id],
      );
    }
  }

  private async close(
    c: pg.PoolClient,
    id: string,
    status: 'withdrawn' | 'expired' | 'resolved_outside' | 'delivered',
    reason: string | null,
    event: string,
    surface: Surface,
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    await this.setStatus(c, id, status, reason, { needsDavid: false });
    await this.audit(c, id, event, surface, { reason, ...detail });
    await this.releaseAndPromote(c, id);
  }

  private async answerRows(id: string): Promise<AnswerRow[]> {
    const { rows } = await this.db.query<AnswerRow>(
      'SELECT * FROM answers WHERE decision_id = $1 ORDER BY version DESC',
      [id],
    );
    return rows;
  }

  private source(row: DecisionRow): SourceRef {
    const s = row.request.source;
    return { system: s.system, ref: s.ref, url: s.url };
  }

  private undoWindowMs(system: string): number {
    return sec(this.config.undoWindowBySource[system] ?? this.config.undoWindowSeconds);
  }

  /** Reads the source; null if the source can't be read by Nod. Source outages are not "unchanged". */
  private async readSource(row: DecisionRow): Promise<SourceState | null> {
    try {
      return await this.adapters.get(row.source_system).fingerprint(this.source(row));
    } catch (err) {
      throw new NodError(
        'source_unavailable',
        `Couldn't check ${row.source_system} right now, so nothing was sent. Try again shortly.`,
        [err instanceof Error ? err.message : String(err)],
      );
    }
  }

  // ---------------------------------------------------------------- intake

  async submit(
    system: string,
    input: unknown,
  ): Promise<{ id: string; status: DecisionStatus; deduplicated: boolean }> {
    const check = validateDecisionRequest(input);
    if (!check.ok || !check.risk) {
      throw new NodError('invalid_request', 'Decision request is invalid', check.errors);
    }
    const req = input as DecisionRequest;
    if (req.source.system !== system) {
      throw new NodError(
        'forbidden',
        `This token may only submit decisions for source "${system}", not "${req.source.system}"`,
      );
    }
    const now = this.clock.now();
    const resources = [...new Set(req.resources ?? [])].sort();

    return this.tx(async (c) => {
      if (req.idempotency_key) {
        // Serialise retries of the same key so one request cannot create two decisions.
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `idem:${system}:${req.idempotency_key}`,
        ]);
        const existing = await c.query<DecisionRow>(
          'SELECT * FROM decisions WHERE source_system = $1 AND idempotency_key = $2',
          [system, req.idempotency_key],
        );
        const row = existing.rows[0];
        if (row) return { id: row.id, status: row.status, deduplicated: true };
      }
      for (const r of resources) {
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`res:${r}`]);
      }
      const holder = await this.findHolder(c, resources, null);
      const status: DecisionStatus = holder ? 'queued' : 'open';
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO decisions
           (source_system, source_ref, idempotency_key, request, risk, provenance_kind, urgency,
            status, waiting_on, fingerprint, last_checked_at, last_heartbeat_at, expires_at,
            deadline_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$11,$11) RETURNING id`,
        [
          system,
          req.source.ref,
          req.idempotency_key ?? null,
          JSON.stringify(req),
          check.risk,
          req.provenance.kind,
          req.urgency ?? 'normal',
          status,
          holder,
          req.fingerprint,
          now,
          new Date(now.getTime() + sec(req.ttl_seconds)),
          req.default ? new Date(req.default.deadline) : null,
        ],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('insert returned no row');
      if (!holder) await this.acquire(c, id, resources);
      await this.audit(c, id, 'created', 'agent', {
        system,
        ref: req.source.ref,
        risk: check.risk,
        provenance: req.provenance.kind,
      });
      if (holder) await this.audit(c, id, 'queued', 'system', { waiting_on: holder });
      await emit(c, { type: 'decision', id, status });
      return { id, status, deduplicated: false };
    });
  }

  private async agentOwned(c: pg.PoolClient, system: string, id: string): Promise<DecisionRow> {
    const row = await this.lockRow(c, id);
    // Report "not found" for other sources' decisions so ids don't leak across tokens.
    if (row.source_system !== system) throw new NodError('not_found', 'No such decision');
    return row;
  }

  async heartbeat(system: string, id: string): Promise<{ expires_at: string }> {
    return this.tx(async (c) => {
      const row = await this.agentOwned(c, system, id);
      if (row.status !== 'open' && row.status !== 'queued') {
        throw new NodError('conflict', `Decision is ${row.status}; nothing to keep alive`);
      }
      const now = this.clock.now();
      const expires = new Date(now.getTime() + sec(row.request.ttl_seconds));
      await c.query('UPDATE decisions SET last_heartbeat_at = $2, expires_at = $3 WHERE id = $1', [
        id,
        now,
        expires,
      ]);
      return { expires_at: expires.toISOString() };
    });
  }

  async withdraw(system: string, id: string, reason = 'Withdrawn by the agent'): Promise<void> {
    await this.tx(async (c) => {
      const row = await this.agentOwned(c, system, id);
      await this.withdrawRow(c, row, reason, 'agent');
    });
  }

  private async withdrawRow(
    c: pg.PoolClient,
    row: DecisionRow,
    reason: string,
    surface: Surface,
  ): Promise<void> {
    if (row.status === 'answered') {
      throw new NodError('conflict', 'An answer is pending; it must be undone or delivered first');
    }
    if (!['queued', 'open', 'stale', 'failed'].includes(row.status)) {
      throw new NodError('conflict', `Decision is already ${row.status}`);
    }
    await this.close(c, row.id, 'withdrawn', reason, 'withdrawn', surface);
  }

  async addUpdate(system: string, input: UpdateInput): Promise<{ id: number }> {
    return this.tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO updates (source_system, kind, level, title, body, project, ref, url, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          system,
          input.kind,
          input.level ?? 'info',
          input.title,
          input.body ?? null,
          input.project ?? null,
          input.ref ?? null,
          input.url ?? null,
          this.clock.now(),
        ],
      );
      const id = Number(rows[0]?.id);
      await emit(c, { type: 'update', id });
      return { id };
    });
  }

  async listUpdates(limit = 50): Promise<Record<string, unknown>[]> {
    const { rows } = await this.db.query('SELECT * FROM updates ORDER BY id DESC LIMIT $1', [
      Math.min(limit, 200),
    ]);
    return rows as Record<string, unknown>[];
  }

  // ---------------------------------------------------------------- reads

  private view(row: DecisionRow, answers: AnswerRow[]): DecisionView {
    const now = this.clock.now();
    const req = row.request;
    const ageSeconds = Math.max(
      0,
      Math.floor((now.getTime() - row.last_checked_at.getTime()) / 1000),
    );
    const latest = answers[0];
    return {
      id: row.id,
      status: row.status,
      status_reason: row.status_reason,
      needs_david: row.needs_david,
      waiting_on: row.waiting_on,
      source: req.source,
      provenance: req.provenance,
      glance: req.glance,
      impact: req.impact,
      options: req.options,
      recommended: req.recommended,
      confidence: req.confidence,
      default: req.default,
      urgency: row.urgency,
      risk: row.risk,
      allow_other: req.allow_other ?? true,
      allow_call: req.allow_call ?? true,
      resources: req.resources ?? [],
      evidence: req.evidence ?? [],
      tried: req.tried,
      created_at: row.created_at.toISOString(),
      freshness: {
        last_checked_at: row.last_checked_at.toISOString(),
        age_seconds: ageSeconds,
        stale: ageSeconds > this.config.reconcilerIntervalSeconds,
      },
      answer:
        latest && latest.status !== 'undone'
          ? {
              version: latest.version,
              option_id: latest.option_id,
              other_text: latest.other_text,
              surface: latest.surface,
              status: latest.status,
              answered_at: latest.answered_at.toISOString(),
              deliver_after: latest.deliver_after.toISOString(),
              can_undo: latest.status === 'pending' && now < latest.deliver_after,
              error: latest.last_error,
            }
          : null,
    };
  }

  async get(id: string): Promise<DecisionView> {
    const { rows } = await this.db.query<DecisionRow>('SELECT * FROM decisions WHERE id = $1', [
      id,
    ]);
    const row = rows[0];
    if (!row) throw new NodError('not_found', 'No such decision');
    return this.view(row, await this.answerRows(id));
  }

  /**
   * `inbox`: what David can act on now (open, plus answered ones still showing undo/sending).
   * `repair`: the Stale & conflicts queue (stale, failed, lock conflicts).
   */
  async list(view: 'inbox' | 'repair' | 'all'): Promise<DecisionView[]> {
    const statuses =
      view === 'inbox'
        ? ['open', 'answered']
        : view === 'repair'
          ? ['stale', 'failed', 'queued']
          : null;
    const { rows } = await this.db.query<DecisionRow>(
      `SELECT * FROM decisions WHERE ($1::text[] IS NULL OR status = ANY($1))
       ORDER BY (urgency = 'urgent') DESC, seq DESC LIMIT 200`,
      [statuses],
    );
    const out: DecisionView[] = [];
    for (const r of rows) out.push(this.view(r, await this.answerRows(r.id)));
    return out;
  }

  async history(id: string): Promise<Record<string, unknown>[]> {
    await this.get(id);
    const { rows } = await this.db.query(
      'SELECT id, event, surface, detail, at FROM audit_log WHERE decision_id = $1 ORDER BY id',
      [id],
    );
    return rows as Record<string, unknown>[];
  }

  /** What the requesting agent gets from await_decision. */
  async awaitResult(system: string, id: string): Promise<AwaitResult> {
    const { rows } = await this.db.query<DecisionRow>('SELECT * FROM decisions WHERE id = $1', [
      id,
    ]);
    const row = rows[0];
    if (!row || row.source_system !== system) throw new NodError('not_found', 'No such decision');
    const reason = row.status_reason ?? undefined;
    switch (row.status) {
      case 'delivered': {
        const a = (await this.answerRows(id)).find((x) => x.status === 'delivered');
        if (!a?.delivered_at) return { decision_id: id, state: 'waiting' };
        return {
          decision_id: id,
          state: 'delivered',
          answer: {
            option_id: a.option_id,
            other_text: a.other_text,
            delivered_at: a.delivered_at.toISOString(),
            fingerprint: a.delivered_fingerprint ?? a.fingerprint_at_answer,
          },
        };
      }
      case 'withdrawn':
        return { decision_id: id, state: reason === 'reask' ? 'reask' : 'withdrawn', reason };
      case 'stale':
        return {
          decision_id: id,
          state: 'stale',
          reason:
            'The source changed after the request was made. Re-submit with a fresh fingerprint.',
        };
      case 'failed':
        return { decision_id: id, state: 'failed', reason };
      case 'expired':
        return { decision_id: id, state: 'expired', reason };
      case 'resolved_outside':
        return { decision_id: id, state: 'resolved_outside', reason };
      default:
        return { decision_id: id, state: 'waiting' };
    }
  }

  /** Keeps the request alive while the agent is demonstrably still waiting on it. */
  async touchFromAwait(system: string, id: string): Promise<void> {
    try {
      await this.heartbeat(system, id);
    } catch (err) {
      if (!(err instanceof NodError)) throw err;
    }
  }

  // ---------------------------------------------------------------- answering

  async answer(id: string, input: AnswerInput): Promise<DecisionView> {
    if (!HUMAN_SURFACES.includes(input.surface) && !AUTOMATIC_SURFACES.includes(input.surface)) {
      throw new NodError('invalid_request', `Unknown surface "${input.surface}"`);
    }
    const hasOption = input.option_id !== undefined;
    const hasOther = input.other_text !== undefined && input.other_text.trim() !== '';
    if (hasOption === hasOther) {
      throw new NodError('invalid_request', 'Provide exactly one of option_id or other_text');
    }

    // Check the source before taking any row lock, so a slow source can't block other work.
    const { rows } = await this.db.query<DecisionRow>('SELECT * FROM decisions WHERE id = $1', [
      id,
    ]);
    const peek = rows[0];
    if (!peek) throw new NodError('not_found', 'No such decision');
    const live = peek.status === 'open' ? await this.readSource(peek) : null;

    const outcome = await this.tx(async (c): Promise<'ok' | 'stale' | 'resolved'> => {
      const row = await this.lockRow(c, id);
      const existing = (
        await c.query<AnswerRow>(
          'SELECT * FROM answers WHERE decision_id = $1 ORDER BY version DESC LIMIT 1',
          [id],
        )
      ).rows[0];

      if (row.status === 'answered' && existing && existing.status !== 'undone') {
        // A double tap (or retry) of the same answer is one answer. A different one must wait for Undo.
        const sameText = existing.other_text === (hasOther ? (input.other_text ?? null) : null);
        if (existing.option_id === (input.option_id ?? null) && sameText) return 'ok';
        throw new NodError(
          'conflict',
          'This decision already has an answer. Undo it first to change it.',
        );
      }
      if (row.status !== 'open') {
        throw new NodError(
          'conflict',
          row.status === 'queued'
            ? 'This decision is waiting behind another one on the same resource'
            : `This decision is ${row.status} and can't be answered`,
        );
      }

      const req = row.request;
      let optionId: string | null = null;
      let writes = false;
      if (hasOption) {
        const opt = req.options.find((o) => o.id === input.option_id);
        if (!opt) throw new NodError('invalid_request', `Unknown option "${input.option_id}"`);
        optionId = opt.id;
        writes = opt.writes;
      } else {
        if (req.allow_other === false) {
          throw new NodError('invalid_request', 'Free-text answers are not allowed here');
        }
        // Free text may direct the agent to do anything, so treat it as a write.
        writes = true;
      }
      this.assertWriteApproval(row, writes, input.surface);

      const now = this.clock.now();
      if (live?.resolved) {
        await this.close(
          c,
          id,
          'resolved_outside',
          'Resolved outside Nod',
          'resolved_outside',
          'system',
          {
            stage: 'answer',
          },
        );
        return 'resolved';
      }
      if (live && live.fingerprint !== row.fingerprint) {
        await this.setStatus(c, id, 'stale', 'Changed since you looked');
        await this.audit(c, id, 'rejected_stale', input.surface, {
          stage: 'answer',
          expected: row.fingerprint,
          actual: live.fingerprint,
        });
        await c.query('UPDATE decisions SET last_checked_at = $2 WHERE id = $1', [id, now]);
        return 'stale';
      }

      const version = row.answer_version + 1;
      await c.query(
        `INSERT INTO answers (decision_id, version, option_id, other_text, surface, status,
                              idempotency_key, answered_at, deliver_after, next_attempt_at,
                              fingerprint_at_answer)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$8,$9)`,
        [
          id,
          version,
          optionId,
          hasOther ? input.other_text : null,
          input.surface,
          `${id}:${version}`,
          now,
          new Date(now.getTime() + this.undoWindowMs(row.source_system)),
          row.fingerprint,
        ],
      );
      await c.query(
        `UPDATE decisions SET answer_version = $2, last_checked_at = COALESCE($3, last_checked_at) WHERE id = $1`,
        [id, version, live ? now : null],
      );
      await this.setStatus(c, id, 'answered', null);
      await this.audit(c, id, 'answered', input.surface, { option_id: optionId, version });
      return 'ok';
    });
    if (outcome === 'stale') {
      throw new NodError(
        'stale',
        'Changed since you looked. Nothing was sent; the agent will be asked to re-ask.',
      );
    }
    if (outcome === 'resolved')
      throw new NodError('conflict', 'This was already resolved at the source');
    return this.get(id);
  }

  /** The write-approval guard: automatic surfaces never choose a write for outside input. */
  private assertWriteApproval(row: DecisionRow, writes: boolean, surface: Surface): void {
    if (writes && row.provenance_kind === 'external' && !HUMAN_SURFACES.includes(surface)) {
      throw new NodError(
        'forbidden',
        'Actions that write need David to choose them for requests from outside',
      );
    }
  }

  async undo(id: string, surface: Surface): Promise<DecisionView> {
    await this.tx(async (c) => {
      const row = await this.lockRow(c, id);
      const a = (
        await c.query<AnswerRow>(
          'SELECT * FROM answers WHERE decision_id = $1 ORDER BY version DESC LIMIT 1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      const now = this.clock.now();
      if (row.status !== 'answered' || !a || a.status !== 'pending' || now >= a.deliver_after) {
        throw new NodError(
          'conflict',
          'Too late to undo: the answer is already being sent or was sent',
        );
      }
      await c.query(`UPDATE answers SET status = 'undone' WHERE id = $1`, [a.id]);
      // An undone silent default must not immediately re-apply itself.
      await this.setStatus(c, id, 'open', null, {
        needsDavid: AUTOMATIC_SURFACES.includes(a.surface) ? true : undefined,
      });
      await this.audit(c, id, 'undone', surface, { version: a.version });
    });
    return this.get(id);
  }

  // ---------------------------------------------------------------- repair (David)

  async withdrawByDavid(id: string, surface: Surface): Promise<DecisionView> {
    await this.tx(async (c) => {
      const row = await this.lockRow(c, id);
      await this.withdrawRow(c, row, 'Withdrawn by David', surface);
    });
    return this.get(id);
  }

  /** Asks the requesting agent to re-submit with a fresh fingerprint. */
  async reask(id: string, surface: Surface): Promise<DecisionView> {
    await this.tx(async (c) => {
      const row = await this.lockRow(c, id);
      if (!['stale', 'failed', 'open', 'queued'].includes(row.status)) {
        throw new NodError('conflict', `Decision is ${row.status}; nothing to re-ask`);
      }
      await this.close(c, id, 'withdrawn', 'reask', 'reask_requested', surface);
    });
    return this.get(id);
  }

  /** Re-reads the source now. A stale card whose source went back to what it was becomes open again. */
  async refresh(id: string, surface: Surface): Promise<DecisionView> {
    const { rows } = await this.db.query<DecisionRow>('SELECT * FROM decisions WHERE id = $1', [
      id,
    ]);
    const peek = rows[0];
    if (!peek) throw new NodError('not_found', 'No such decision');
    if (!['open', 'stale'].includes(peek.status)) return this.get(id);
    const live = await this.readSource(peek);
    await this.tx(async (c) => {
      const row = await this.lockRow(c, id);
      if (!['open', 'stale'].includes(row.status) || !live) return;
      const now = this.clock.now();
      if (live.resolved) {
        await this.close(
          c,
          id,
          'resolved_outside',
          'Resolved outside Nod',
          'resolved_outside',
          surface,
        );
      } else if (live.fingerprint !== row.fingerprint && row.status === 'open') {
        await this.setStatus(c, id, 'stale', 'Changed since you looked');
        await this.audit(c, id, 'source_changed', surface, { via: 'refresh' });
      } else if (live.fingerprint === row.fingerprint && row.status === 'stale') {
        await this.setStatus(c, id, 'open', null);
        await this.audit(c, id, 'refreshed', surface, { reopened: true });
      } else {
        await this.audit(c, id, 'refreshed', surface, {});
      }
      await c.query('UPDATE decisions SET last_checked_at = $2 WHERE id = $1', [id, now]);
    });
    return this.get(id);
  }

  // ---------------------------------------------------------------- background work

  /** Withdraws open decisions whose agent stopped heartbeating. */
  async expireDue(): Promise<number> {
    const now = this.clock.now();
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM decisions WHERE status IN ('open','queued') AND expires_at <= $1`,
      [now],
    );
    let n = 0;
    for (const { id } of rows) {
      await this.tx(async (c) => {
        const row = await this.lockRow(c, id);
        if (!['open', 'queued'].includes(row.status) || row.expires_at > this.clock.now()) return;
        await this.close(c, id, 'expired', 'agent stopped', 'expired', 'system', {
          last_heartbeat_at: row.last_heartbeat_at.toISOString(),
        });
        n++;
      });
    }
    return n;
  }

  /** At a default's deadline, apply it, unless that would write on outside input without David. */
  async applyDefaultsDue(): Promise<number> {
    const now = this.clock.now();
    const { rows } = await this.db.query<DecisionRow>(
      `SELECT * FROM decisions WHERE status = 'open' AND needs_david = false AND deadline_at <= $1`,
      [now],
    );
    let n = 0;
    for (const row of rows) {
      const def = row.request.default;
      const opt = def && row.request.options.find((o) => o.id === def.option);
      if (!def || !opt) continue;
      if (opt.writes && row.provenance_kind === 'external') {
        await this.tx(async (c) => {
          const locked = await this.lockRow(c, row.id);
          if (locked.status !== 'open' || locked.needs_david) return;
          await this.setStatus(
            c,
            row.id,
            'open',
            "Needs David: a default can't send for outside requests",
            {
              needsDavid: true,
            },
          );
          await this.audit(c, row.id, 'default_blocked', 'default', { option_id: opt.id });
        });
        continue;
      }
      try {
        await this.answer(row.id, { option_id: opt.id, surface: 'default' });
        n++;
      } catch (err) {
        if (!(err instanceof NodError)) throw err;
      }
    }
    return n;
  }

  /** Compares open decisions with their sources: catches missed events and outside changes. */
  async reconcile(): Promise<{ checked: number; closed: number; stale: number }> {
    const { rows } = await this.db.query<DecisionRow>(
      `SELECT * FROM decisions WHERE status = 'open'`,
    );
    const out = { checked: 0, closed: 0, stale: 0 };
    for (const peek of rows) {
      let live: SourceState | null;
      try {
        live = await this.adapters.get(peek.source_system).fingerprint(this.source(peek));
      } catch {
        continue; // Source down: leave last_checked_at alone so the card shows as needing refresh.
      }
      if (!live) continue;
      out.checked++;
      await this.tx(async (c) => {
        const row = await this.lockRow(c, peek.id);
        if (row.status !== 'open') return;
        if (live.resolved) {
          await this.close(
            c,
            row.id,
            'resolved_outside',
            'Resolved outside Nod',
            'resolved_outside',
            'system',
            {
              via: 'reconciler',
            },
          );
          out.closed++;
        } else if (live.fingerprint !== row.fingerprint) {
          await this.setStatus(c, row.id, 'stale', 'Changed since you looked');
          await this.audit(c, row.id, 'source_changed', 'system', { via: 'reconciler' });
          await c.query('UPDATE decisions SET last_checked_at = $2 WHERE id = $1', [
            row.id,
            this.clock.now(),
          ]);
          out.stale++;
        } else {
          await c.query('UPDATE decisions SET last_checked_at = $2 WHERE id = $1', [
            row.id,
            this.clock.now(),
          ]);
        }
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- outcome writer

  /** Delivers every answer whose undo window has ended. Returns how many were handled. */
  async deliverDue(): Promise<number> {
    let n = 0;
    for (;;) {
      const a = await this.claimDue();
      if (!a) return n;
      await this.processClaimed(a);
      n++;
    }
  }

  private async claimDue(): Promise<AnswerRow | null> {
    const now = this.clock.now();
    const live = this.config.deliveryMode === 'live';
    // Compare-and-swap claim: only one worker can move an answer to `delivering`.
    // Answers held by dry_run are picked up again if the mode goes back to live.
    const { rows } = await this.db.query<AnswerRow>(
      `UPDATE answers SET status = 'delivering', attempts = attempts + 1, claimed_at = $1
       WHERE id = (
         SELECT id FROM answers
         WHERE ((status = 'pending' AND deliver_after <= $1 AND next_attempt_at <= $1)
             OR (status = 'dry_run' AND $2)
             OR (status = 'delivering' AND claimed_at <= $3))
         ORDER BY deliver_after, id FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING *`,
      [now, live, new Date(now.getTime() - sec(120))],
    );
    return rows[0] ?? null;
  }

  private async processClaimed(a: AnswerRow): Promise<void> {
    const { rows } = await this.db.query<DecisionRow>('SELECT * FROM decisions WHERE id = $1', [
      a.decision_id,
    ]);
    const peek = rows[0];
    if (!peek) return;

    if (this.config.deliveryMode === 'dry_run') {
      await this.tx(async (c) => {
        await c.query(
          `UPDATE answers SET status = 'dry_run', attempts = GREATEST(attempts - 1, 0) WHERE id = $1`,
          [a.id],
        );
        await this.audit(c, a.decision_id, 'delivery_dry_run', 'system', {
          option_id: a.option_id,
          version: a.version,
          note: 'NOD_DELIVERY_MODE=dry_run: logged, not sent',
        });
      });
      return;
    }

    // Defence in depth: the guard also runs at send time.
    const opt = peek.request.options.find((o) => o.id === a.option_id);
    const writes = a.option_id === null || (opt?.writes ?? true);
    if (writes && peek.provenance_kind === 'external' && !HUMAN_SURFACES.includes(a.surface)) {
      await this.tx(async (c) => {
        await this.lockRow(c, a.decision_id);
        await c.query(`UPDATE answers SET status = 'undone' WHERE id = $1`, [a.id]);
        await this.setStatus(
          c,
          a.decision_id,
          'open',
          "Needs David: outside requests can't write on a default",
          {
            needsDavid: true,
          },
        );
        await this.audit(c, a.decision_id, 'default_blocked', 'system', { stage: 'delivery' });
      });
      return;
    }

    // Revalidate at send time, then deliver. A source outage is a failed attempt, never "unchanged".
    let state: SourceState | null;
    try {
      state = await this.adapters.get(peek.source_system).fingerprint(this.source(peek));
    } catch (err) {
      await this.deliveryFailed(a, peek, err);
      return;
    }
    if (state?.resolved) {
      await this.tx(async (c) => {
        await this.lockRow(c, a.decision_id);
        await c.query(`UPDATE answers SET status = 'stale' WHERE id = $1`, [a.id]);
        await this.close(
          c,
          a.decision_id,
          'resolved_outside',
          'Resolved outside Nod',
          'resolved_outside',
          'system',
          {
            stage: 'delivery',
          },
        );
      });
      return;
    }
    if (state && state.fingerprint !== a.fingerprint_at_answer) {
      await this.tx(async (c) => {
        await this.lockRow(c, a.decision_id);
        await c.query(`UPDATE answers SET status = 'stale' WHERE id = $1`, [a.id]);
        await this.setStatus(c, a.decision_id, 'stale', 'Changed since you looked');
        await this.audit(c, a.decision_id, 'rejected_stale', 'system', {
          stage: 'delivery',
          expected: a.fingerprint_at_answer,
          actual: state.fingerprint,
        });
      });
      return;
    }

    const checkedFingerprint = state?.fingerprint ?? a.fingerprint_at_answer;
    try {
      await this.adapters.get(peek.source_system).deliver({
        decisionId: a.decision_id,
        source: this.source(peek),
        optionId: a.option_id,
        otherText: a.other_text,
        idempotencyKey: a.idempotency_key,
        fingerprint: checkedFingerprint,
      });
    } catch (err) {
      await this.deliveryFailed(a, peek, err);
      return;
    }

    await this.tx(async (c) => {
      const row = await this.lockRow(c, a.decision_id);
      const now = this.clock.now();
      // Swap only if this is still the answer the decision is waiting on.
      const res = await c.query(
        `UPDATE answers SET status = 'delivered', delivered_at = $2, delivered_fingerprint = $3, last_error = NULL
         WHERE id = $1 AND status = 'delivering'`,
        [a.id, now, checkedFingerprint],
      );
      if (res.rowCount === 0 || row.status !== 'answered' || row.answer_version !== a.version)
        return;
      await this.close(c, a.decision_id, 'delivered', null, 'delivered', 'system', {
        version: a.version,
        option_id: a.option_id,
        idempotency_key: a.idempotency_key,
      });
    });
  }

  private async deliveryFailed(a: AnswerRow, row: DecisionRow, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    await this.tx(async (c) => {
      const now = this.clock.now();
      if (a.attempts < this.config.maxDeliveryAttempts) {
        await c.query(
          `UPDATE answers SET status = 'pending', last_error = $2, next_attempt_at = $3 WHERE id = $1`,
          [
            a.id,
            message,
            new Date(now.getTime() + sec(this.config.retryBackoffSeconds * a.attempts)),
          ],
        );
        await this.audit(c, a.decision_id, 'delivery_retry', 'system', {
          attempt: a.attempts,
          error: message,
        });
        return;
      }
      const plain = `Couldn't send your answer to ${row.source_system}: ${message}`;
      await this.lockRow(c, a.decision_id);
      await c.query(`UPDATE answers SET status = 'failed', last_error = $2 WHERE id = $1`, [
        a.id,
        plain,
      ]);
      await this.setStatus(c, a.decision_id, 'failed', plain);
      await this.audit(c, a.decision_id, 'failed', 'system', {
        attempts: a.attempts,
        error: message,
      });
    });
  }
}
