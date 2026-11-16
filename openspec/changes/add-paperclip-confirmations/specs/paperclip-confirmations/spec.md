# Spec Delta

## Purpose

Lets David answer Paperclip's yes/no confirmation cards from Nod. Paperclip stays the source of truth: Nod asks on its behalf and records the answer only once the undo window has passed and the card is unchanged.

## ADDED Requirements

### Requirement: Plain confirmations become decisions
Every pending yes/no confirmation on an open Paperclip issue that David can answer SHALL appear in Nod as one decision with the card's own accept and decline wording, or Confirm and Decline when it has none. The decision SHALL say what the answer means for the agent and name the issue it belongs to. A new confirmation SHALL appear within about a minute of being created.

#### Scenario: New confirmation
- **WHEN** an agent asks David on an open issue "Did you publish these pages?"
- **THEN** within about a minute one card appears in Nod with that question and the card's accept and decline wording

#### Scenario: Card without custom wording
- **WHEN** a confirmation has no accept or decline wording
- **THEN** the Nod card offers Confirm and Decline

#### Scenario: Same confirmation seen twice
- **WHEN** Nod's check finds a confirmation it already sent
- **THEN** no second card is created

#### Scenario: Link back to the issue
- **WHEN** Paperclip's address is configured
- **THEN** the card includes a link to the issue

### Requirement: Confirmations Nod cannot answer stay in Paperclip
Confirmations whose answer needs more than a yes or no, or carries more authority than a phone tap, SHALL NOT appear in Nod. This covers confirmations that run a tool, grant an agent a secret, connect an account, require a written reason to decline, are addressed to someone other than David, were dismissed, or cannot be accepted yet because the project workspace is still being prepared.

#### Scenario: Confirmation that runs a tool
- **WHEN** a confirmation asks David to let an agent run a tool action
- **THEN** it does not appear in Nod

#### Scenario: Secret or account access
- **WHEN** a confirmation asks to give an agent a secret or to connect an account
- **THEN** it does not appear in Nod

#### Scenario: Decline needs a reason
- **WHEN** a confirmation requires a written reason to decline
- **THEN** it does not appear in Nod, because Nod cannot collect free text for it

#### Scenario: Addressed to someone else
- **WHEN** a confirmation is addressed to a person other than David
- **THEN** it does not appear in Nod

#### Scenario: Dismissed confirmation
- **WHEN** David has dismissed a confirmation in Paperclip
- **THEN** it does not appear in Nod

#### Scenario: Workspace still being prepared
- **WHEN** a confirmation cannot be accepted yet because the project workspace is still being prepared
- **THEN** it does not appear in Nod until it can be accepted

#### Scenario: Other question types
- **WHEN** an agent asks a multiple-choice, free-text, checkbox or per-item question
- **THEN** it does not appear in Nod

### Requirement: Only companies set up for Nod are asked about
Confirmations SHALL be sent to Nod only for companies that have Nod settings in Paperclip. A company without them SHALL send nothing and SHALL NOT cause errors.

#### Scenario: Company without Nod settings
- **WHEN** a company has a pending confirmation but no Nod settings
- **THEN** nothing is sent to Nod and other companies are unaffected

### Requirement: Confirmation answers are written only if nothing changed
After the undo window, Nod SHALL record David's answer on the confirmation only if it is still the version he looked at. Otherwise it SHALL write nothing and ask again about the current version if it is still pending.

#### Scenario: Accepted and left alone
- **WHEN** David confirms in Nod and the confirmation is unchanged when the undo window ends
- **THEN** it is accepted in Paperclip, attributed to David, and the agent continues

#### Scenario: Declined and left alone
- **WHEN** David declines in Nod and the confirmation is unchanged when the undo window ends
- **THEN** it is declined in Paperclip, attributed to David, with a note that the answer came from Nod

#### Scenario: Confirmation changed meanwhile
- **WHEN** the agent replaces or revises the confirmation after David answered
- **THEN** David's answer is not applied and, if a confirmation is still pending, a new card shows it

#### Scenario: Answered in Paperclip first
- **WHEN** David or anyone else answers the confirmation in Paperclip while the Nod card is open
- **THEN** the card closes as resolved outside Nod and nothing is written

#### Scenario: Issue closed meanwhile
- **WHEN** the issue is closed or the confirmation is withdrawn while the card is open
- **THEN** the card closes and nothing is written

#### Scenario: Paperclip refuses or is briefly unreachable
- **WHEN** the write to Paperclip fails
- **THEN** it is retried until it succeeds or the confirmation changes

### Requirement: Approvals keep working alongside confirmations
Adding confirmations SHALL NOT change how board approvals appear in Nod or how their answers are recorded.

#### Scenario: Approval and confirmation at the same time
- **WHEN** a board approval and an issue confirmation are both pending
- **THEN** each appears as its own card and each answer is written to its own item
