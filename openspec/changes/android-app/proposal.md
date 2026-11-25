# Proposal

## Why

David can only answer decisions at his desk. The board approved the Android app (phase 1, BYT-753) so the loop works from his phone: he sees what is waiting, answers or undoes from anywhere, and — with the RayNeo mirror on — a new question reaches his glasses within seconds.

## What Changes

- New `apps/android` package in the workspace: Expo / React Native, Android only, no changes to `apps/core`, `packages/contract`, or `apps/web`.
- Device-token sign-in (the same token as the web inbox), stored in encrypted storage, with sign out.
- Inbox with the settled web order (urgent first, then oldest) and the same filters, plus decision detail: options with the recommended one marked, impact first, evidence collapsed, Other, and the Talk-it-through placeholder.
- Answer and undo: the same server-authoritative undo window as the web, with the countdown and undo bar surviving background and process death (encrypted local record, reconciled against core on resume).
- Five Android notification channels with one-tap answers: urgent alerts any hour; normal decisions only in open hours (8:00–20:00 Phoenix); internal decisions offer the top two options plus Open; external provenance never gets an inline answer; the undo window posts with an Undo action any hour.
- RayNeo mirror: when enabled in Settings, a new decision posts a high-priority notification the official RayNeo AI app shows on the lenses, with title ≤ 48 and question ≤ 120 characters (fitted automatically). No custom firmware, no Bluetooth code.
- Updates tab (sweeps, digests, agent reports) and Settings (theme, channels, RayNeo setup steps, server-set open hours and delivery mode shown read-only).

## Out of scope

- Any glasses client code (firmware, Bluetooth, live captions) — the mirror is the official RayNeo AI app.
- Cooldown batching and open-hours policy changes (those belong to the core policy loop).
- iOS, web push, FCM push (local notifications only), Call Me.
- Production UI: the phase 1 markup is provisional and is followed by a Designer UI pass (BYT-753 stays open until that task closes).

## Capabilities

### New Capabilities

- `android-app`: how David uses Nod from his phone — access, inbox parity with the desk, answering and undo that survive the phone, notifications and quiet hours, one-tap answers, and the glasses mirror budget.
