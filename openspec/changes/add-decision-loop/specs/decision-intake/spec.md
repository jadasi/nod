# Spec Delta

## Purpose

Defines how agents ask David for a decision: the shape of a request, how it is validated, and how its life is kept alive or ended by the agent.

## ADDED Requirements

### Requirement: Structured decision requests
The system SHALL accept decision requests only when they validate against `packages/contract/decision.schema.json`, and SHALL reject any other request with an error that names each failing field.

#### Scenario: Valid request is accepted
- **WHEN** an agent calls `request_decision` with a payload that validates against the schema
- **THEN** the system stores it as an open decision, returns its id, and records a `created` audit entry

#### Scenario: Glance text too long
- **WHEN** an agent submits a request whose `glance.question` is longer than 120 characters
- **THEN** the system rejects it, names `glance.question` and the limit, and stores nothing

#### Scenario: Recommended option does not exist
- **WHEN** `recommended` or `default.option` does not match any option `id`
- **THEN** the system rejects the request and names the field

### Requirement: Idempotent submission
The system SHALL treat a repeated `idempotency_key` from the same source as the same request.

#### Scenario: Agent retries after a timeout
- **WHEN** an agent submits a request with an `idempotency_key` that already belongs to an open decision
- **THEN** the system returns the existing decision id and creates no new decision

### Requirement: Write risk is derived, not declared
The system SHALL mark a decision as `write` risk when any of its options has `writes: true`, regardless of what the agent claims elsewhere.

#### Scenario: Mixed options
- **WHEN** a request has options "Send reply" (`writes: true`) and "Skip" (`writes: false`)
- **THEN** the stored decision has risk `write`

### Requirement: Heartbeat and expiry
The system SHALL expire an open decision whose `ttl_seconds` has passed since the agent's last heartbeat, and SHALL withdraw it with the reason "agent stopped".

#### Scenario: Agent keeps the request alive
- **WHEN** the agent heartbeats before the TTL elapses
- **THEN** the decision stays open and its expiry moves forward

#### Scenario: Agent dies
- **WHEN** no heartbeat arrives within `ttl_seconds`
- **THEN** the decision is withdrawn with reason "agent stopped", disappears from the inbox, and an audit entry is recorded

### Requirement: Agent withdrawal
The system SHALL let the requesting agent withdraw its own open decision, and SHALL remove it from every surface.

#### Scenario: Agent no longer needs an answer
- **WHEN** the agent withdraws a decision that has no answer pending
- **THEN** the decision is closed as withdrawn and clients receive the change over SSE

### Requirement: Awaiting an answer
`await_decision` SHALL return the delivered answer together with the fingerprint it was checked against, so the agent can verify its own preconditions before acting.

#### Scenario: Answer delivered
- **WHEN** the outcome writer delivers an answer
- **THEN** `await_decision` returns the chosen option (or free text), the delivered-at time, and the fingerprint
