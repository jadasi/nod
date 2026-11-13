import type { DecisionRequest } from '@nod/contract';

/** The parts of a Paperclip approval this adapter reads. Structurally satisfied by the SDK's `Approval`. */
export interface ApprovalLike {
  id: string;
  companyId: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  /** Date in-process, ISO string once it has crossed the plugin bridge. */
  updatedAt: Date | string;
}

export type PaperclipAction = 'approve' | 'reject';

export interface TranslatedApproval {
  request: DecisionRequest;
  /** Which Paperclip action each Nod option id performs. */
  actions: Record<string, PaperclipAction>;
  /** Labels, so write-back notes say what David chose. */
  labels: Record<string, string>;
}

/**
 * Approval types Nod handles. `budget_override_required` is resolved from the Costs page in
 * Paperclip (approve/reject are not available for it), so Nod must not offer a button that can't work.
 */
const HANDLED_TYPES = new Set(['hire_agent', 'approve_ceo_strategy', 'request_board_approval']);

export function isHandled(a: Pick<ApprovalLike, 'type' | 'status'>): boolean {
  return HANDLED_TYPES.has(a.type) && a.status === 'pending';
}

/** Opaque precondition token: changes when the approval is decided, revised or resubmitted. */
export function fingerprintOf(a: Pick<ApprovalLike, 'status' | 'updatedAt'>): string {
  return `${a.status}:${new Date(a.updatedAt).toISOString()}`;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const SLUG = /^[a-z0-9_-]{1,32}$/;

/**
 * Paperclip approval payloads are free-form JSON with no `options[]`; the board can only approve,
 * reject or request a revision. So an agent may add an optional `nod` block to its payload:
 *
 *   nod: { impact, options: [{ id, label, outcome, decision: 'approve' | 'reject' }], recommended, urgent }
 *
 * Every option maps onto approve or reject, because that is all Paperclip can record. Without a
 * `nod` block the card offers plain Approve / Reject built from the standard payload fields.
 */
export function translate(
  a: ApprovalLike,
  opts: { baseUrl?: string | undefined; ttlSeconds: number },
): TranslatedApproval {
  const p = a.payload;
  const nod = (typeof p.nod === 'object' && p.nod !== null ? p.nod : {}) as Record<string, unknown>;
  const title = str(p.title) ?? defaultTitle(a.type, str(p.name));
  const summary = str(p.summary);
  const recommendedAction = str(p.recommendedAction);

  const custom = Array.isArray(nod.options) ? parseOptions(nod.options) : null;
  const options =
    custom ??
    ([
      {
        id: 'approve',
        label: 'Approve',
        outcome: recommendedAction ?? 'The request goes ahead as proposed.',
        decision: 'approve',
      },
      {
        id: 'reject',
        label: 'Reject',
        outcome: 'The request is turned down and the agent is told no.',
        decision: 'reject',
      },
    ] as const);

  const actions: Record<string, PaperclipAction> = {};
  const labels: Record<string, string> = {};
  for (const o of options) {
    actions[o.id] = o.decision;
    labels[o.id] = o.label;
  }
  const recommendedId = str(nod.recommended);
  const recommended = recommendedId && actions[recommendedId] ? recommendedId : options[0]!.id;

  const risks = Array.isArray(p.risks)
    ? p.risks.filter((r): r is string => typeof r === 'string')
    : [];
  const evidence: NonNullable<DecisionRequest['evidence']> = [];
  if (opts.baseUrl) {
    evidence.push({
      kind: 'link',
      label: 'Open in Paperclip',
      url: `${opts.baseUrl.replace(/\/$/, '')}/approvals/${a.id}`,
    });
  }
  if (risks.length) {
    evidence.push({
      kind: 'text',
      label: 'Risks noted',
      text: clip(risks.map((r) => `- ${r}`).join('\n'), 4000),
    });
  }

  const request: DecisionRequest = {
    idempotency_key: `paperclip:approval:${a.id}:${fingerprintOf(a)}`,
    source: {
      system: 'paperclip',
      ref: a.id,
      ...(opts.baseUrl ? { url: `${opts.baseUrl.replace(/\/$/, '')}/approvals/${a.id}` } : {}),
    },
    provenance: { kind: 'internal' },
    glance: {
      title: clip(title, 48),
      question: clip(recommendedAction ?? summary ?? `Approve or reject: ${title}`, 120),
    },
    impact: clip(str(nod.impact) ?? summary ?? title, 600),
    options: options.map((o) => ({
      id: o.id,
      label: clip(o.label, 20),
      outcome: clip(o.outcome, 240),
      // Approving can hire, spend or unblock work, and Paperclip offers no undo for a decision.
      reversible: false,
      writes: o.decision === 'approve',
    })) as DecisionRequest['options'],
    recommended,
    fingerprint: fingerprintOf(a),
    resources: [`paperclip-approval:${a.id}`],
    // Free text can't be recorded on a Paperclip approval through the plugin API, so don't offer it.
    allow_other: false,
    allow_call: true,
    urgency: nod.urgent === true ? 'urgent' : 'normal',
    ...(evidence.length ? { evidence } : {}),
    ttl_seconds: opts.ttlSeconds,
  };
  return { request, actions, labels };
}

function parseOptions(
  raw: unknown[],
): { id: string; label: string; outcome: string; decision: PaperclipAction }[] | null {
  const out: { id: string; label: string; outcome: string; decision: PaperclipAction }[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return null;
    const o = r as Record<string, unknown>;
    const id = str(o.id);
    const label = str(o.label);
    const outcome = str(o.outcome);
    if (!id || !SLUG.test(id) || !label || !outcome) return null;
    if (o.decision !== 'approve' && o.decision !== 'reject') return null;
    out.push({ id, label, outcome, decision: o.decision });
  }
  // Nod requires 2-4 options with unique ids; anything else falls back to Approve / Reject.
  if (out.length < 2 || out.length > 4 || new Set(out.map((o) => o.id)).size !== out.length)
    return null;
  return out;
}

function defaultTitle(type: string, name?: string): string {
  switch (type) {
    case 'hire_agent':
      return name ? `Hire ${name}` : 'Hire a new agent';
    case 'approve_ceo_strategy':
      return 'Approve the CEO strategy';
    default:
      return 'Board approval needed';
  }
}
