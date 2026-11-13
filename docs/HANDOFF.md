# Nod — handoff

_Formerly "Mission Control" in the design doc; renamed to Nod on 2026-11-13._

Everything decided in the design session on 2026-11-13, so a fresh session (human or agent) can build without the original chat.

- **Living design doc (source of truth for intent):** https://claude.ai/artifact/SJWpCZbtp8LCQGz7anDFC1
- **This file:** the condensed, build-ready version. If it conflicts with the doc, the doc's "Decisions from review" section wins. Update this file whenever that section changes.

## 1. What we're building

A **decision router** for one person (David). Agents across his tools block on him for approvals and choices; today he must sit at a desk and open each tool. Nod:

1. Takes in every "needs a human" request from every source as one structured **Decision**.
2. Cuts how many reach him: standing rules, defaults on silence, dedupe, cooldown batching.
3. Shows what remains on thin clients: Android app, lock screen and Wear OS notifications, Even Realities G2 glasses, a desk web view.
4. Lets him talk through a decision, or create a new task, on a realtime voice call (**Call Me**).
5. Writes the answer back to the source after a 2-minute undo window, and checks the source hasn't changed first.

Success metric: **time tasks spend waiting on David**, and **decisions per day reaching David**. Both should fall week over week.

## 2. Decisions (final)

| Topic | Decision |
| --- | --- |
| Users | Single user (David). No multi-user, no roles. |
| App platform | **Android only.** Expo (React Native). Calls via Android ConnectionService. |
| Hosting | **Everything on Railway.** Railway Postgres. **No Supabase.** Change events via Postgres LISTEN/NOTIFY → SSE to clients. |
| Approval gate | Approving in the app or on the glasses is sufficient (phone lock is the gate). No biometric tier. |
| Undo | Every answer is held **2 minutes** before it's written to the source ("Sending in 1:47 · Undo"). Delay configurable per decision type. |
| Outside input (email etc.) | May start read-only work freely: research, triage, draft replies. **Any write action** (send, deploy, delete, spend, change anything external) requires David's approval. Enforce with tool permissions and scoped tokens, not prompt wording. Cards show provenance (e.g. "from external email x@y.com"). |
| Interruptions | Dynamic cooldown modelled on Android's notification cooldown: first card alerts immediately; cards that follow soon after get quieter and batched; cooldown grows while they keep coming; resets after a quiet period. |
| Urgent | `urgent` label bypasses cooldown and always sorts to the top. |
| Hours | **8am–8pm America/Phoenix.** Outside hours only `urgent` alerts. Everything else waits for an 8am digest; default-on-silence deadlines pause overnight. |
| Default on silence | Every request states what happens if unanswered by its deadline. On glasses this is UI, not text: the default option is highlighted with a draining countdown ring. |
| Framing | Decisions are framed by **human / end-user impact**, not technical detail. Agents own technical review. Cards and detail view lead with "what changes, for whom"; options are phrased as outcomes; technical evidence is collapsed at the bottom. David makes product, vendor, cost and people calls. |
| Call or card | The classifier decides per request. Fits a quick choice → card. Can't be summarized into a quick choice → Nod **calls David** (open hours only). No pickup → falls back to a card. |
| Updates tab | Scheduled sweep of all work areas every 2 hours (8am–8pm) plus an end-of-day digest. Shown as an **Updates** tab in the app and on glasses. |
| New tasks | OpenSpec change proposal only when the target project's `AGENTS.md` asks for it. Otherwise a plain Paperclip task brief. |
| Classification | **Haiku-class model with structured output** (urgency, risk, call-or-card, duplicate-of, project) and it writes glance/impact text. Behind one `Classifier` interface. TypeSafe's Jev was evaluated and is not needed at this volume. |
| Telegram stopgap | Dropped. |
| Voice | **OpenAI GPT-Live-1** (full duplex, $0.05/min voice layer) with **Claude as the delegated backend** for reasoning and tools. Transport: **LiveKit Agents** over in-app WebRTC. Budget target < $50/mo; hard monthly cap enforced in core. |

## 3. Architecture

```
Sources                          Core (Railway)                         Surfaces
-------                          --------------                         --------
Paperclip plugin  ─┐   ┌─ Adapters + decision contract (MCP + REST) ─┐   ┌─ Android app (inbox, detail, Updates)
Claude Code hooks ─┤   │  Router + policy engine                     │   ├─ Lock screen / Wear OS actions
Hermes bridge     ─┼──▶│  (rules · defaults · cooldown · hours)      │◀─▶├─ Even Hub glasses app
Email triage agent─┤   │  Decision store + audit log (Postgres)      │   ├─ Web (desk)
GitHub · Railway  ─┘   └─ Outcome writer (undo, revalidate, CAS)    ─┘   └─ Call Me (GPT-Live-1 via LiveKit)
                                          ▲                                        │
                                          └── report_decision · create_task ── Claude backend (delegated reasoning)
```

Agents never talk to a surface directly. Everything goes through core.

### Components

| Layer | Choice | Notes |
| --- | --- | --- |
| Decision contract | MCP server: `request_decision`, `await_decision`, `notify`, `report_progress`. JSON Schema in `packages/contract`. | Shape borrowed from handup's `ask_question`. `glance` fields have hard char limits for the 576×288 display. |
| Core service | TypeScript, Hono, Railway Postgres, SSE | LISTEN/NOTIFY for change fan-out. |
| Paperclip adapter | Paperclip plugin (`definePlugin`) subscribing to approval/issue events; writes answers via REST | Verify approval payloads can carry `options[]`; else use issue comments. |
| Claude Code adapter | Claude Code hooks (permission prompts, stop/notification) + Agent SDK tool-permission callback | For worktree agents outside Paperclip. |
| Hermes adapter | Bridge from Hermes webhook / API server | Replaces Hermes' chat-bound `/approve`. Hermes stays the email-triage worker. |
| Policy | Rules in Postgres, evaluated in-process; Haiku classifier | Log every decision for rule suggestions (after N identical picks). |
| Android app | Expo + NativeWind + react-native-reusables + TanStack Query + Zustand | Same stack as HUM Operator. Actionable notifications (lock screen, Wear OS). |
| Glasses | Even Hub app, `@evenrealities/even_hub_sdk`, TypeScript/Vite | Runs inside the Even app on the phone; 576×288 monochrome green; R1 ring: swipe = move, tap = select, double tap = skip, long press = Call Me. G2 has mics, no speaker. Build against the simulator now. |
| "Other" dictation | GPT-Realtime-Whisper ($0.017/min) or a G2 STT shim | |
| Auth/audit | Device-bound token for the single user; scoped per-source tokens; append-only decision log | Nod can deploy to prod: treat as a prod credential. |

## 4. The Decision object (summary)

See `packages/contract/decision.schema.json` for the authoritative schema. Key fields:

- `source` (system, ref, url), `provenance` (internal | external + origin, e.g. sender email)
- `glance`: `title` (≤ 48 chars), `question` (≤ 120 chars), options with `label` (≤ 20 chars)
- `impact`: who is affected and how, in plain language (the lead of the detail view)
- `options[]` (2–4): `id`, `label`, `outcome` (what happens for people), `reversible`, `writes` (bool)
- `recommended` (option id) + `confidence`
- `default`: option id + `deadline` (paused outside open hours unless urgent)
- `urgency`: `normal` | `urgent`; `risk`: `low` | `write` (computed: any option with `writes: true` is `write`)
- `allow_other` (free text), `allow_call`
- `fingerprint`: opaque precondition token from the source (revision, SHA, thread last-message id, deploy id)
- `resources[]`: lock keys this decision would act on (e.g. `env:dental-staging`, `email-thread:<id>`)
- `evidence[]`: links, images, previews (collapsed, technical)
- `ttl_seconds` + agent heartbeat

## 5. Keeping state fresh (the hard part)

1. **Source stays the truth.** Store pointer + precondition fingerprint, never a trusted copy.
2. **Revalidate at answer time and send time.** Outcome writer re-reads the source on tap and again when the undo window ends. Fingerprint changed → card shows "Changed since you looked" and returns to the agent to re-ask instead of writing.
3. **Agents re-check.** `await_decision` returns the answer plus the fingerprint it was made against; the agent verifies preconditions before acting (compare-and-swap).
4. **Expiry.** Each request has a TTL kept alive by agent heartbeat; dead agent → card withdraws ("agent stopped").
5. **Resource locks.** Registry of what each pending decision acts on; a second decision on the same resource queues behind or merges into the first.
6. **Events first, sweep second.** Webhooks/SSE for speed; a reconciler every 5 minutes diffs open cards against sources, catching missed events and manual changes ("resolved outside Nod").
7. **Idempotent writes.** Every outcome carries an idempotency key.
8. **Visible freshness.** Each card shows "checked 40s ago"; older than the reconciler interval → refresh state.
9. **Repair tools.** "Stale & conflicts" queue: re-ask, withdraw, force refresh; linked to the audit log.

## 6. Call Me

- GPT-Live-1 voice layer; Claude is the delegated backend (GPT-Live-1 supports third-party backend models).
- Session briefing: the Decision, short evidence summary, what the agent already tried.
- Tools: `fetch_detail`, `ask_backend` (Claude research), `report_decision`, `create_task`.
- **Never commits.** `report_decision` only creates an "I heard: … Confirm?" card; one tap confirms; then the normal undo window applies.
- Task-creation mode: interviewer prompt + workspace context pack (projects, clients, each project's AGENTS.md conventions, Paperclip org chart). Output: task brief (or OpenSpec draft where AGENTS.md asks), target project, target agent. Also an ideas-backlog capture mode.
- Outbound calls: only for decisions classified "call", only 8am–8pm; missed call → card.
- Budget: ~260 min/mo ≈ $13 voice + $5–15 Claude. Hard cap in core.

## 7. Build plan

1. **Contract and core.** JSON Schema, MCP server (`request_decision`, `await_decision`, `notify`), Postgres + audit log on Railway, Paperclip plugin adapter, bare web inbox (PWA) proving the loop end to end. Includes fingerprints, revalidation, undo window, idempotency from day one.
2. **Android app.** Inbox, detail (impact-first), Updates tab, actionable notifications (lock screen + Wear OS), undo countdown, daily digest. Claude Code hooks adapter, Hermes bridge.
3. **Policy loop.** Cooldown, urgent bypass, open hours, defaults on silence, rule suggestions, reconciler + Stale & conflicts queue. Track decisions/day and wait time.
4. **Call Me — single decision.** LiveKit Agents + GPT-Live-1 + Claude backend, ConnectionService, confirm card, spend cap, call-or-card routing.
5. **Call Me — new tasks.** Interviewer, context packs, ideas backlog.
6. **Glasses.** Even Hub app in the simulator (can start after phase 1): glance card, countdown ring, ring gestures, Updates tab, long press → Call Me on phone.

## 8. Open questions (verify during phase 1)

- Can Paperclip approval payloads carry `options[]`? Can plugins push events out, or must we poll/SSE?
- Does GPT-Live-1 support in-app WebRTC sessions, or only SIP / server WebSocket? (Decides whether LiveKit is required.)
- How do Paperclip agents signal "blocked on human" — approval vs blocked issue? Pick one convention.
- Even Hub SDK: mic/STT access and any network restrictions for calling our API.

## 9. Development process

- **Spec-driven with OpenSpec**, used lightly. Behavior changes get a change proposal; fixes, refactors and tooling don't (`no-spec` label). Specs describe behavior and effect on people, never implementation, which keeps sync overhead low. Phase 1 is drafted as `openspec/changes/add-decision-loop`.
- **Testing:** unit, integration against real Postgres, contract fixtures, and an end-to-end loop test with a fake source. Every spec scenario maps to a test.
- **CI:** PR CI on the self-hosted runners is the only gate, with no staging. Merging to `main` deploys `nod-core` to Railway (after CI passes) and ships Android changes via EAS (Update for JS, local build for native). `NOD_DELIVERY_MODE=dry_run` is the kill switch; Railway rollback covers bad deploys; migrations follow expand/contract.
- Full rules: `AGENTS.md`.

## 10. Environment facts

- Paperclip is self-hosted on Railway (project `paperclip-selfhosted`, pinned image `ghcr.io/paperclipai/paperclip:2026.916.1`, authenticated/public mode).
- David's dev workflow: GitHub for everything; async agents in worktrees opening PRs; GitHub Actions on local self-hosted runners.
- Hermes Agent (Nous Research) is in use; it has an OpenAI-compatible API server and webhook support.

See `docs/research.md` for the prior-art and pricing research behind these choices.
