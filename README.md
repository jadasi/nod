# Nod

A personal decision inbox for AI agents. Agents in Paperclip, Claude Code, Hermes and email triage ask for decisions in one structured format. Nod cuts how many reach me, shows the rest on Android, notifications and Even G2 glasses, lets me talk them through on a realtime voice call, and writes the answer back safely.

- Design doc: https://claude.ai/artifact/SJWpCZbtp8LCQGz7anDFC1
- Build-ready summary: [docs/HANDOFF.md](docs/HANDOFF.md)
- Research: [docs/research.md](docs/research.md)
- Contract: [packages/contract/decision.schema.json](packages/contract/decision.schema.json)
- Agent instructions: [AGENTS.md](AGENTS.md)
- Specs: [openspec/](openspec/) — current behavior in `specs/`, in-flight work in `changes/`

## How it's built

- **Spec-driven** with [OpenSpec](https://github.com/Fission-AI/OpenSpec). Behavior changes start as a change proposal, and specs describe behavior, not implementation.
- **Tested.** Unit, integration (real Postgres), contract and end-to-end loop tests. Every spec scenario has a test.
- **PR CI is the gate. No staging.** Typecheck, lint, tests and spec validation run on every PR, and Android PRs also build a preview APK. Merging to `main` deploys `nod-core` to Railway after CI passes and ships Android updates through EAS. `NOD_DELIVERY_MODE=dry_run` is the kill switch.
