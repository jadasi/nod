# Spec Delta

## Purpose

Keeps every card true to its source. Nod never trusts its own copy: it stores a pointer and a fingerprint, and checks the source at the moments that matter.

## ADDED Requirements

### Requirement: Revalidate before delivery
The outcome writer SHALL re-read the source's current fingerprint when David answers and again when the undo window ends, and SHALL NOT deliver if it no longer matches.

#### Scenario: Source changed during the undo window
- **WHEN** someone pushes a new commit to the PR branch after David approves but before the window ends
- **THEN** the answer is not delivered, the card shows "Changed since you looked", and the agent is asked to re-submit

#### Scenario: Source unchanged
- **WHEN** the fingerprint matches at both checks
- **THEN** the answer is delivered

### Requirement: Resource locks
The system SHALL track the `resources` of open decisions, and a new request that names a resource already held by an open decision SHALL be queued behind it or merged into it, never shown as an independent competing card.

#### Scenario: Two agents want the same staging environment
- **WHEN** agent B requests a decision on `env:staging` while agent A's decision on it is open
- **THEN** B's request is queued, shown as "waiting on" A's card, and surfaces only after A's decision closes

### Requirement: Reconciliation
A reconciler SHALL compare every open decision with its source at least every 5 minutes, and SHALL close decisions the source shows are already resolved.

#### Scenario: David approved it in Paperclip directly
- **WHEN** the reconciler finds the Paperclip approval already resolved
- **THEN** the card closes as "resolved outside Nod" and disappears from every surface

#### Scenario: Missed webhook
- **WHEN** an event from the source was lost
- **THEN** the next reconciler pass catches the change

### Requirement: Visible freshness
Each open decision SHALL show when its source was last checked. A decision whose last check is older than the reconciler interval SHALL show a refresh state instead of looking current.

#### Scenario: Stale card
- **WHEN** a card's last successful check was 9 minutes ago
- **THEN** the card shows a refresh state and offers Refresh

### Requirement: Repair queue
The system SHALL keep a "Stale & conflicts" queue holding decisions rejected as stale, failed deliveries and lock conflicts, each with one-tap Re-ask, Withdraw, and Force refresh.

#### Scenario: Re-ask
- **WHEN** David taps Re-ask on a stale decision
- **THEN** the requesting agent is notified to re-submit with a fresh fingerprint
