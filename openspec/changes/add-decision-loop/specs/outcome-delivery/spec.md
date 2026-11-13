# Spec Delta

## Purpose

Defines how David's answer becomes an action at the source, safely: held for an undo window, only for write actions he approved, delivered exactly once, and recorded.

## ADDED Requirements

### Requirement: Undo window
The system SHALL hold every answer for an undo window before delivering it to the source. The default is 120 seconds, configurable per decision type.

#### Scenario: David changes his mind
- **WHEN** David answers and then taps Undo before the window ends
- **THEN** nothing is sent to the source, the decision returns to open, and both events are audited

#### Scenario: Window elapses
- **WHEN** the undo window ends without an Undo
- **THEN** the outcome writer proceeds to the freshness check and delivery

### Requirement: Write actions need explicit approval
The system SHALL deliver an option with `writes: true` only when David chose it himself. Rules and defaults on silence SHALL NOT select a write option for a decision whose provenance is `external`.

#### Scenario: External email asks for a reply to be sent
- **WHEN** a decision from an external email reaches its default deadline with default option "Send"
- **THEN** the system does not send, keeps the decision open, and marks it as needing David

#### Scenario: Read-only work from outside
- **WHEN** an external email leads an agent to research or draft a reply
- **THEN** no decision is required, because nothing is written

### Requirement: Exactly-once delivery
Every delivery SHALL carry an idempotency key derived from the decision id and answer version, so a retry or double tap cannot deliver twice.

#### Scenario: Double tap
- **WHEN** David taps the same option twice within a second
- **THEN** one answer is recorded and at most one delivery is made

#### Scenario: Network retry
- **WHEN** a delivery attempt times out and is retried
- **THEN** the source receives the same idempotency key and applies the answer once

### Requirement: Audit trail
The system SHALL record an append-only audit entry for every state change of a decision: created, answered, undone, delivered, failed, rejected as stale, withdrawn, expired. Each entry records the surface it came from.

#### Scenario: Reconstructing a decision
- **WHEN** David opens a decision's history
- **THEN** he sees every state change in order, with time and surface

### Requirement: Delivery failure is visible
The system SHALL surface a failed delivery to David instead of silently retrying forever.

#### Scenario: Source rejects the write
- **WHEN** the source returns an error after the allowed retries
- **THEN** the decision moves to the "Stale & conflicts" queue with the error in plain language
