# Spec Delta

## Purpose

Defines the desk view of Nod: how David sees what is waiting on him, answers it, and watches the undo window run. It is the first surface that proves the whole loop.

## ADDED Requirements

### Requirement: Inbox shows what is waiting, impact first
The system SHALL show David every decision waiting on him, urgent ones first and then the longest-waiting, and SHALL lead each decision's detail with who is affected and how, with technical evidence collapsed below it.

#### Scenario: Urgent decision arrives among others
- **WHEN** an urgent decision arrives while normal ones are waiting
- **THEN** it appears at the top of the inbox without a page reload

#### Scenario: Opening a decision
- **WHEN** David opens a decision
- **THEN** he sees the effect on people first, the options as outcomes with the recommended one marked, and evidence hidden until he expands it

### Requirement: Answering shows a live undo countdown
The system SHALL show, from the moment David answers, how long remains in the undo window and SHALL let him undo until it ends.

#### Scenario: Answering a decision
- **WHEN** David picks an option
- **THEN** he sees "Sending in" with a countdown and an Undo button

#### Scenario: Undo
- **WHEN** David taps Undo before the countdown ends
- **THEN** the decision is open again and he can choose differently

#### Scenario: Window ends
- **WHEN** the countdown reaches zero
- **THEN** Undo is no longer offered and he sees whether the answer was sent, held, found stale, or failed

### Requirement: Honest about freshness and what is written
The system SHALL show how recently each decision was checked against its source, SHALL show the stale and conflicting queue with ways to re-ask, refresh or withdraw, and SHALL say plainly when answers are being held instead of written.

#### Scenario: Source changed
- **WHEN** a decision is marked stale because its source changed
- **THEN** it appears under "Stale & conflicts" and is not offered for answering until it is re-asked

#### Scenario: Dry-run mode
- **WHEN** the service is in dry-run mode
- **THEN** a banner says answers are held and logged, not written to sources

### Requirement: Access is limited to David's device token
The system SHALL show no decision data to anyone without David's device token, and SHALL keep the token only in the browser it was entered in.

#### Scenario: Wrong token
- **WHEN** someone enters an invalid token
- **THEN** they see an error and no decisions
