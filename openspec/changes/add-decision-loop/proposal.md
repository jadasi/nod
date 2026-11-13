# Proposal

## Why

Agents block on David in several tools, and he has to be at a desk to find and answer them. Phase 1 proves the core loop end to end: an agent asks for a decision in one structured format, David answers from a bare web inbox, and the answer reaches the source safely. The safety rules (undo window, freshness check, no unapproved outside writes) are the part that would hurt most if they were wrong, so they're specified first and built in from day one.

## What Changes

- New `packages/contract`: the Decision JSON Schema (already drafted) plus generated TypeScript types and validators.
- New `apps/core` (Hono on Railway, Railway Postgres): REST + SSE API, an MCP server exposing `request_decision`, `await_decision`, `notify`, and `report_progress`, a decision store with an append-only audit log, and an outcome writer that holds each answer for an undo window and checks the source before writing.
- New `adapters/paperclip`: a Paperclip plugin that turns blocked work and approvals into decisions and writes answers back.
- New `apps/web`: a minimal web inbox (PWA) to answer decisions, with an undo countdown and freshness indicator.
- CI on pull requests: typecheck, lint, tests, contract validation, `openspec validate`, and Railway deploy of `main` only after CI passes.

Out of scope for this change: the Android app, cooldown and open-hours policy, rule suggestions, Call Me, and the glasses app.

## Capabilities

### New Capabilities
- `decision-intake`: how agents submit, update, heartbeat and withdraw decision requests, and the validation applied to them.
- `outcome-delivery`: how an answer becomes a write to the source — the undo window, approval requirements for write actions, idempotency, and the audit trail.
- `source-freshness`: how Nod keeps cards true to their sources — fingerprints, revalidation, resource locks, reconciliation, and visible staleness.

### Modified Capabilities

## Impact

- New services on Railway: `nod-core` and Postgres. Secrets live in Railway variables.
- Paperclip gets a new plugin installed on the self-hosted instance.
- Agents that adopt the MCP tools stop asking for approval in their own UIs.
