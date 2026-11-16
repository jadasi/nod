# Tasks

## 1. Scenario tests first

- [x] 1.1 Translation tests: a plain confirmation yields a contract-valid request with its labels (or Confirm/Decline), issue link, per-confirmation resource lock; run `pnpm --filter @david_osco/nod-paperclip-plugin test`
- [x] 1.2 Exclusion tests, one per excluded case (tool action, secret, connection, decline needs reason, other addressee, dismissed, workspace pending, other kinds)
- [x] 1.3 Sync tests: send once, accept and decline write-back, changed meanwhile, answered first, issue closed, retry after refusal, approvals unaffected, links without a kind treated as approvals

## 2. Implementation

- [x] 2.1 Confirmation translation and exclusion rules in the translate module; tests 1.1 and 1.2 pass
- [x] 2.2 Kind-aware links and confirmation reader/writer in the sync module; tests 1.3 pass
- [x] 2.3 Sweep open issues per configured company and wire the reader/writer in the worker; worker test with a host that denies unscoped calls passes
- [x] 2.4 Manifest: add the three permissions, bump to 0.2.0 in package.json and manifest; typecheck, lint and prettier pass

## 3. Docs and verification

- [x] 3.1 Update README (supported items, permissions) and the resolved question in `docs/HANDOFF.md`
- [ ] 3.2 `npx @fission-ai/openspec@2.0.0 validate --strict --all` passes
- [ ] 3.3 Upgrade the local Paperclip plugin (operator approves permissions) and confirm BYT-682's confirmation appears in Nod

## Workflow follow-up

- After merge: tag `paperclip-v0.2.0` to publish, then archive this change.
