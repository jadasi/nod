# AGENTS.md — Nod

Read `docs/HANDOFF.md` before doing anything. It holds every product decision. Don't re-decide what's settled there; if something seems wrong, raise it instead of changing it.

## What this repo is

A single-user decision router. Agents submit structured decision requests; Nod filters, routes and shows them on an Android app, notifications and Even G2 glasses, and writes answers back to the source after an undo window.

## Layout (target)

```
packages/contract   JSON Schema + generated TS types for the Decision object (source of truth)
apps/core           Hono service on Railway: REST + SSE + MCP server, policy engine, outcome writer, reconciler
apps/web            Bare web inbox (PWA) — phase 1 proof of the loop
apps/android        Expo app (Android only)
apps/glasses        Even Hub app (TypeScript/Vite), simulator-first
apps/voice          LiveKit Agents worker for Call Me (GPT-Live-1 + Claude backend)
adapters/paperclip  Paperclip plugin (definePlugin)
adapters/hermes     Hermes bridge
adapters/claude-code Claude Code hooks
```

## Rules

- **TypeScript everywhere**, pnpm workspaces, strict mode. Node 22.
- **Railway only** for hosting. Railway Postgres. Do not add Supabase or other hosted backends.
- **Android only** for the app. Don't add iOS-specific code paths.
- **The contract is the source of truth.** Change `packages/contract/decision.schema.json` first, regenerate types, then code.
- **Never write to a source without**: (1) an approved outcome, (2) the undo window having elapsed, (3) a fresh fingerprint check, (4) an idempotency key.
- **Writes from external provenance always require explicit approval.** Never auto-resolve them by rule or default.
- **Impact over implementation.** Any user-facing text explains effect on people; technical evidence goes in collapsed evidence fields.
- **Times** are America/Phoenix for open hours (8am–8pm). Store UTC.
- **Secrets** come from Railway variables. Never commit them.
- Tests: Vitest for TS packages. Every policy rule and the outcome writer's revalidation path need tests.
- Small PRs, one concern each, with a short description of user-visible effect.

## Spec-driven development (OpenSpec)

Specs in `openspec/specs/` are the record of what Nod does and why. Code follows specs.

- **Needs a change proposal** (`/openspec-propose`): new behavior, or a change to existing behavior that David would notice. That includes policy rules, safety invariants, the contract, and anything user-facing.
- **Doesn't**: bug fixes that restore specced behavior, refactors, dependency bumps, tooling, docs. Add the `no-spec` label to the PR.
- Specs describe **behavior and its effect on people**, not implementation. Never put library names, file paths or function names in a spec, so refactors can't make it stale.
- Every scenario maps to a test. Write the scenario's test first.
- Archive the change (`openspec archive`) in the PR that finishes its last task, so specs and code land together.
- CI runs `openspec validate --strict`. A PR that changes behavior without a change or the `no-spec` label fails review.

## Testing and CI

Just David, so **no staging environment**. Pull-request CI is the gate, and `main` is production.

- **Tests:** Vitest unit tests for every package; integration tests for `apps/core` against a real Postgres (CI service container); contract tests from schema fixtures; an end-to-end loop test using a fake source adapter (request → answer → undo → delivery → revalidation). The outcome writer and every policy rule need tests for each spec scenario.
- **PR CI** (GitHub Actions on the self-hosted runners): install, typecheck, lint, tests, `openspec validate --strict`. For PRs touching `apps/android`, also build a preview APK with `eas build --local --profile preview` and attach it as an artifact, to avoid EAS cloud build minutes.
- **Merge to `main`:** Railway auto-deploys `nod-core` only after CI passes ("wait for CI"). Android: JavaScript-only changes ship as an EAS Update to the production channel; native changes produce a new local EAS build, which David installs.
- **Branch protection:** PRs required on `main`, CI must pass. No direct pushes.
- **Safety net in place of staging:** `NOD_DELIVERY_MODE=dry_run` (a Railway variable) makes the outcome writer log instead of writing to sources. Use it when testing against real sources, or as a kill switch. Railway's one-click rollback covers bad deploys.
- **Migrations** must be backward compatible with the previous deploy (expand, then contract), because there's no staging to catch a breaking one.

## Out of scope unless asked

Multi-user, roles, iOS, Telegram, Supabase, Jev (keep the `Classifier` interface swappable instead).
