# Tasks

## 1. Repo and CI foundation

- [ ] 1.1 pnpm workspace, TypeScript strict, Node 22, ESLint, Prettier, Vitest
- [x] 1.2 GitHub Actions PR workflow on GitHub-hosted runners: install, typecheck, lint, unit tests, integration tests against a Postgres service container, `openspec validate --strict`
- [ ] 1.3 Branch protection on `main`: PR required, CI must pass
- [ ] 1.4 Railway: `nod-core` service and Postgres; auto-deploy from `main` with "wait for CI"; health check endpoint
- [x] 1.5 `NOD_DELIVERY_MODE` variable (`live` | `dry_run`) as a kill switch: in `dry_run` the outcome writer logs instead of writing to sources

## 2. Contract

- [ ] 2.1 Generate TS types and an Ajv validator from `decision.schema.json`
- [ ] 2.2 Cross-field checks (recommended/default option exists, derived `write` risk)
- [ ] 2.3 Fixture-based contract tests (valid and invalid examples)

## 3. Core: intake

- [x] 3.1 Postgres schema: decisions, answers, audit_log (append-only), resource_locks; migrations
- [x] 3.2 REST endpoints and MCP server: `request_decision`, `await_decision`, `notify`, `report_progress`, heartbeat, withdraw
- [x] 3.3 Idempotent submission, TTL expiry job
- [x] 3.4 LISTEN/NOTIFY → SSE stream for clients
- [x] 3.5 Single-user auth: device-bound token for clients; scoped per-source tokens for agents

## 4. Core: outcome delivery and freshness

- [x] 4.1 Outcome writer with undo window, idempotency keys, retry limits
- [x] 4.2 Write-approval guard (external provenance never auto-writes)
- [x] 4.3 Revalidation at answer time and send time via a `SourceAdapter.fingerprint()` interface
- [x] 4.4 Resource lock queueing/merging
- [x] 4.5 Reconciler (5-minute sweep) and "Stale & conflicts" queue
- [x] 4.6 A fake source adapter for tests, and an end-to-end test: request → answer → undo → answer → window elapses → fingerprint check → delivery

## 5. Paperclip adapter

- [ ] 5.1 Resolve open questions: can approval payloads carry `options[]`; how agents signal "blocked on human"; can plugins push events or must we poll/SSE
- [ ] 5.2 Paperclip plugin: blocked work and approvals → `request_decision`; answers → REST write-back; fingerprint = approval/issue revision
- [ ] 5.3 Install on the self-hosted Paperclip instance and verify with one real approval

## 6. Web inbox

- [ ] 6.1 Minimal PWA: inbox list, impact-first detail view, options, Other, undo countdown, "checked Ns ago", Stale & conflicts queue
- [ ] 6.2 Served by `nod-core`, behind the device token
