# Spec Delta

## Purpose

Defines the phone view of Nod: how David sees what is waiting, answers or
undoes from anywhere, and — with the RayNeo mirror on — gets a new question on
his lenses. It is the second surface that proves the whole loop, after the web
inbox.

## ADDED Requirements

### Requirement: Access is limited to David's device token
The app SHALL show no decision data to anyone without David's device token, and SHALL keep the token and the pending-answer records only in Android's encrypted storage, with a sign-out that clears both.

#### Scenario: Signing in
- **WHEN** David enters his server URL and device token
- **THEN** the app verifies the token against the server before storing it, and shows the inbox

#### Scenario: Wrong token
- **WHEN** someone enters an invalid token
- **THEN** they see an error and no decisions

#### Scenario: Signing out
- **WHEN** David signs out
- **THEN** the stored token and the stored undo records are deleted and the app returns to sign-in

### Requirement: The inbox matches the desk
The app SHALL show the same decisions, in the same settled order (urgent first, then the longest-waiting), with the same filters the web inbox settled on, and SHALL mark itself live or offline against the event stream.

#### Scenario: The order
- **WHEN** an urgent decision and a normal one are waiting
- **THEN** the urgent one appears first, and otherwise the longest-waiting comes first

#### Scenario: Attention
- **WHEN** a decision needs repair (stale, failed, conflicting)
- **THEN** it is countable under the Attention filter and reachable from the amber row

#### Scenario: Offline
- **WHEN** the event stream is down
- **THEN** the inbox says it is offline and answering is off until Nod reconnects

### Requirement: The decision detail mirrors the desk
The app SHALL show each decision's impact first, its options as outcomes with the recommended one marked, and its technical evidence collapsed, and SHALL offer Other and the Talk-it-through placeholder where the desk does.

#### Scenario: Opening a decision
- **WHEN** David opens a decision
- **THEN** he sees the effect on people first, the options with the recommended one marked, and evidence hidden until he expands it

#### Scenario: External provenance
- **WHEN** a decision comes from outside input
- **THEN** no option is marked as a safe default and the app says plainly that Nod never answers it for him

### Requirement: Answering works from anywhere, and the undo survives the phone
The app SHALL answer decisions the same way the desk does — including Other and the server-authoritative undo window — and SHALL persist each pending answer the moment it is made so that the countdown and the undo bar reappear, exactly where they left off, after backgrounding or a restart.

#### Scenario: Answering
- **WHEN** David picks an option or sends an Other answer
- **THEN** he sees "Sending in" with a countdown and an Undo, and the pending answer is written to encrypted storage at once

#### Scenario: The phone dies in the window
- **WHEN** the app is killed or the phone restarts while the undo window is open
- **THEN** on the next start the undo bar reappears with the same answer and the remaining time, reconciled against the server

#### Scenario: The window ends
- **WHEN** the countdown reaches zero
- **THEN** Undo is no longer offered and he sees whether the answer was sent, held, found stale, or failed

#### Scenario: Undo
- **WHEN** David taps Undo before the countdown ends — in the app or on the notification
- **THEN** the decision is open again, the pending record is cleared, and he can choose differently

### Requirement: Notifications follow the settled rules
The app SHALL post notifications on five channels — urgent, decisions, sending, updates, problems — with urgent decisions alerting any hour, normal decisions only in the open hours, one-tap answers only for internal decisions (top two options, recommended first, plus Open), and no inline answer for external provenance.

#### Scenario: Quiet hours
- **WHEN** a normal decision arrives outside the open hours
- **THEN** it is not alerted; it waits for the 8:00 am digest and shows as waiting in the inbox

#### Scenario: One-tap answer
- **WHEN** David taps an option button on an internal decision's notification
- **THEN** the answer is sent with the undo window applied, the pending record is stored, and the app opens the decision

#### Scenario: External decision
- **WHEN** a decision from outside input is notified
- **THEN** it offers no option buttons, only Review in Nod

#### Scenario: The undo window posts
- **WHEN** an answer is pending
- **THEN** a Sending-channel notification with an Undo action shows the countdown any hour

### Requirement: The glasses mirror fits the lenses
When the RayNeo mirror is enabled in Settings, the app SHALL post a new decision as a high-priority notification for the official RayNeo AI app to mirror to the lenses, with the title at most 48 characters and the question at most 120, fitted automatically, and SHALL keep answering on the phone.

#### Scenario: A new decision with the mirror on
- **WHEN** a new decision arrives while the mirror is enabled
- **THEN** a high-priority notification is posted with the title and question fitted to the lens budget

#### Scenario: The mirror is off
- **WHEN** the mirror is disabled
- **THEN** no glasses notification is posted and the normal channel rules apply

### Requirement: Updates and settings stay honest
The app SHALL show an Updates tab with the server's update rows and a Settings tab where David chooses the theme, toggles the mirror, and sees the RayNeo setup steps, with the server-set open hours and delivery mode shown read-only.

#### Scenario: Updates
- **WHEN** David opens the Updates tab
- **THEN** he sees sweeps, digests, and agent reports in server order

#### Scenario: Delivery mode
- **WHEN** the server is in dry-run mode
- **THEN** Settings and the inbox say answers are held and nothing is written to the source
