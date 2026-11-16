# Proposal

## Why

Most of what Paperclip agents need from David arrives as a yes/no confirmation card on an issue ("Do you want this action? Did you publish it?"), not as a board approval. About 75 such confirmations have been answered so far, against 2 approvals. Because Nod only sees approvals, nearly all real blocking questions still need David at a desk. BYT-682's open confirmation never reached Nod.

## What Changes

- The Paperclip plugin also turns pending yes/no confirmation cards on open issues into Nod decisions, and records David's answer on the card once the undo window has passed, with the same freshness check as approvals.
- Confirmations Nod cannot answer safely or completely stay in Paperclip: ones that run a tool, grant a secret, connect an account, require a written reason to decline, are addressed to someone else, or were dismissed.
- The plugin asks Paperclip for three more permissions (read issues, read and answer issue confirmations). Paperclip makes the operator approve this when the plugin is upgraded.
- `docs/HANDOFF.md` is updated: David has now chosen to add issue confirmations (2026-11-15), which that document listed as a possible later addition.

Out of scope: multiple-choice and free-text questions, checkbox confirmations, per-item verdicts, task suggestions, account-connection requests, instant delivery on creation (a card can take up to a minute to appear), and setting Nod up for companies that have no Nod settings.

## Capabilities

### New Capabilities
- `paperclip-confirmations`: which Paperclip confirmation cards appear in Nod, which stay in Paperclip, and how David's answer is recorded safely.

### Modified Capabilities

## Impact

- `adapters/paperclip`: new reader and writer for issue confirmations, a new plugin version, and the extra permissions in its manifest.
- Paperclip: upgrading the installed plugin needs the operator to approve the new permissions.
- Companies without Nod settings (for example HUM today) still send nothing until they are configured.
