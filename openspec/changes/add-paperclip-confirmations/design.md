# Design

## Context

The Paperclip plugin (`adapters/paperclip`) turns board approvals into Nod decisions, using `approval.created` events with a one-minute job as a safety net, and writes the answer back through a fingerprint compare-and-swap. See proposal.md for why confirmations are added.

Facts about Paperclip that shape this:
- Confirmations are issue-thread interactions of kind `request_confirmation`. They live on issues, not in approvals, and the plugin API reads them per issue.
- The plugin API emits no event when an interaction is created, answered or withdrawn.
- Config and secrets are per company, and a scheduled job carries no company, so every call names the company (fixed in #12).
- Answering through the plugin API requires an active human board member as actor. Accepting can be refused (for example while the workspace is being prepared), and answering an already-resolved confirmation is a harmless no-op.
- A `request_confirmation` can also carry a tool action, a secret proposal, or a connection authorization. Paperclip's own chat gateway restricts itself to plain yes/no cards for the same reason.

## Goals / Non-Goals

**Goals:** reuse the existing send, wait, fingerprint and write-back flow for a second kind of source item; keep every safety rule identical to approvals.

**Non-Goals:** instant delivery; other interaction kinds; offering free text; configuring companies.

## Decisions

- **Find confirmations by sweeping open issues each minute** (statuses todo, in progress, in review, blocked), listing each issue's interactions. Alternative: subscribe to `activity.logged` for interaction actions for instant delivery. Rejected for v1: unverified that plugins receive it, and a minute is acceptable. It can be added later without changing behavior, only latency.
- **Fingerprint is the confirmation's status plus last-updated time**, as for approvals. Any revision, answer, withdrawal or supersession changes it, so a stale answer is never written.
- **Each open decision remembers its kind** (approval or confirmation). Decisions saved before this change have no kind and are treated as approvals. The wait loop reads and writes through the matching reader and writer.
- **Exclusions are decided from the confirmation itself** and re-checked each sweep, so a card whose confirmation later becomes excluded is withdrawn rather than answered.
- **Declining records a short note** (the plugin API accepts a reason on decline only); accepting records none.
- **New plugin permissions:** read issues, read issue confirmations, answer issue confirmations. Paperclip treats added permissions as an escalation, so upgrading the installed plugin puts it in "upgrade pending" until the operator approves.
- Version 0.2.0. No contract change: `source.system = "paperclip"` already exists and the card reuses the approval shape. The source ref is the confirmation's id, and the resource lock is per confirmation.

## Risks / Trade-offs

- Sweep volume: about one list call per open issue per minute (roughly 60 today) → acceptable now; revisit with the event path if issue counts grow.
- Cards can take up to a minute to appear → stated in the spec; same order as the 2-minute undo window.
- A confirmation on an issue in a terminal status is not found → intended, since such issues are closed.
- HUM has two pending confirmations but no Nod settings → they stay in Paperclip until HUM is configured.

## Migration Plan

Build 0.2.0, upgrade the plugin locally with the operator approving the new permissions, verify with BYT-682's pending confirmation, then publish. Rollback: reinstall 0.1.1; open decisions without a kind remain valid approvals and confirmations simply stop being sent.
