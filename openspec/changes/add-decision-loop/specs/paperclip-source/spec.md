# Spec Delta

## Purpose

Lets David answer Paperclip board approvals from Nod instead of opening Paperclip. Paperclip stays the source of truth: Nod only asks on its behalf and records the answer once the undo window has passed.

## ADDED Requirements

### Requirement: Approvals become decisions
Every pending board approval that David can approve or reject SHALL appear in Nod as one decision, with Approve and Reject outcomes written in terms of what changes for people. An approval whose payload names its own options SHALL show those options instead. An approval David can only resolve elsewhere in Paperclip SHALL NOT appear.

#### Scenario: New approval
- **WHEN** an agent asks the board to approve a hire
- **THEN** one card appears in Nod saying what the hire changes, with Approve and Reject

#### Scenario: Same approval seen twice
- **WHEN** Paperclip announces the same approval again, or Nod's catch-up check finds it
- **THEN** no second card is created

#### Scenario: Budget approval
- **WHEN** a budget override needs the board
- **THEN** it does not appear in Nod, because it can only be resolved from Paperclip's cost controls

### Requirement: Answers are written only if nothing changed
After the undo window, Nod SHALL record David's answer on the approval only if the approval is still the version he looked at. Otherwise it SHALL write nothing and ask again about the current version.

#### Scenario: Answered and left alone
- **WHEN** David approves in Nod and the approval is unchanged when the undo window ends
- **THEN** the approval is approved in Paperclip, attributed to David, with a note that the answer came from Nod

#### Scenario: Agent revised the approval meanwhile
- **WHEN** the agent resubmits a changed approval after David answered
- **THEN** David's answer is not applied and a new card shows the revised approval

#### Scenario: Decided in Paperclip first
- **WHEN** someone approves or rejects it in Paperclip while the card is open
- **THEN** the card closes as resolved outside Nod and nothing is written

#### Scenario: Paperclip is briefly unreachable
- **WHEN** the write to Paperclip fails
- **THEN** it is retried until it succeeds or the approval changes
