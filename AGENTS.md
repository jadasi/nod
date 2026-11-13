# AGENTS.md — Mission Control

Read `docs/HANDOFF.md` before doing anything. It holds every product decision. Don't re-decide what's settled there; if something seems wrong, raise it instead of changing it.

## What this repo is

A single-user decision router. Agents submit structured decision requests; Mission Control filters, routes and shows them on an Android app, notifications and Even G2 glasses, and writes answers back to the source after an undo window.

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

## Out of scope unless asked

Multi-user, roles, iOS, Telegram, Supabase, Jev (keep the `Classifier` interface swappable instead).
