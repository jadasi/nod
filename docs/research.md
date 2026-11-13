# Research notes (2026-11-13)

Prior-art scan by a research subagent, plus voice pricing research. Items marked (unverified) came from secondary or aggregator pages.

## Bottom line

Nothing covers the whole loop. Every agent inbox found is keyed to coding sessions or tool calls; none ingests Paperclip tasks or email. Build a thin decision service; borrow the pieces below.

## Prior art

| Project | What it gives | Verdict |
| --- | --- | --- |
| [Paperclip](https://docs.paperclip.ing/) | MIT. REST API (companies, agents, issues, approvals, costs); plugin SDK (`definePlugin`: tools, actions, event handlers, scheduled jobs, `onWebhook`); SSE activity events; MCP wrapper over REST. Approvals are board-style (pending / revision requested / approved / rejected / cancelled) with a JSON payload; types include `request_board_approval`. No dedicated outbound webhook subsystem described. | Build the adapter as a Paperclip plugin. Model N-option choices as an approval payload `options[]` or issue comments. |
| [handup](https://dev.to/arielf/one-inbox-for-all-my-agents-42lk) | MCP tools `notify`, `ask_question` (choices), `request_approval`; swipe-to-approve mobile inbox over Tailscale. License unknown. | Copy the data model. David liked it. |
| [Happier](https://docs.happier.dev/features/inbox-and-approvals) | Global inbox of approvals and structured user-action requests; actionable push. | UX reference. Coding-session bound. |
| Happy (MIT, unverified) | Mobile mirror of Claude Code / Codex sessions. | Not the inbox. |
| [Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/) | Gateway (Telegram, Slack, Email, …), webhooks, OpenAI-compatible API server; `/approve` `/deny` for dangerous commands. | Email-triage worker; bridge its approvals into Mission Control. |
| [call-me](https://second-brain-nuxt.vercel.app/call-me) | Claude Code plugin; Twilio calls; turn-based STT/TTS; ~$0.03–0.04/min. | Reference only — not realtime. |
| [OpenAI SIP / Live sessions](https://developers.openai.com/api/docs/guides/voice-sip) | Inbound SIP; outbound dial-out on `gpt-live-1`; sideband WebSocket for tools/transcripts. | Voice engine. |
| [LiveKit Agents](https://livekit.com/blog/human-in-the-loop-voice-agents) | Open-source realtime voice: WebRTC, SIP dial-out, function tools, any model. | Voice transport. |
| [awesome-even-realities-g2](https://github.com/pangoleen/awesome-even-realities-g2) | Even Hub SDK/CLI/simulator; community `claude-code-g2`, Hermes Glass, `even-g2-apps`, STT shims (`even-voice-shim`, `stt-even-g2`). | Read `claude-code-g2` and Hermes Glass before building the glasses client. |
| Paperclip Telegram plugin, PClip (iOS) | Existing mobile surfaces. | Skipped by David. |
| HumanLayer, Omnara, Conductor, AgentsRoom | Pivoted / discontinued / terminal mirrors. | Skip. |

Not researched: Pipecat, Vapi, Retell, gotoHuman, LangChain Agent Inbox, Even G1 libraries.

## Even Realities G2

- Even Hub launched 2026 as an app store + SDK; apps are TypeScript (`@evenrealities/even_hub_sdk`), run inside the Even Realities phone app, and draw on the glasses. Desktop simulator available. Apps compile to a single `.ehpk`.
- Display 576×288, monochrome green. App icons 24×24 monochrome.
- Input: Even R1 ring — tap, double tap, swipe, long press (shared across all apps). Temple touch also exists.
- Mics yes (two-mic noise cancellation, LC3 audio per community project); no speaker; no camera. Official SDK reportedly lacks on-device STT — community shims exist.
- Sources: https://www.evenrealities.com/blogs/even-insider/the-unfinished-glasses , https://www.digitaltrends.com/wearables/even-realities-launches-even-hub-to-turn-g2-smart-glasses-into-a-full-app-ecosystem/

## Realtime voice pricing (as of Oct–Nov 2026)

| Option | Price | Notes |
| --- | --- | --- |
| [GPT-Live-1](https://openai.com/index/introducing-gpt-live-1-in-the-api/) | $0.05/min voice layer, billed per second, + backend model tokens | API since 2026-09-10. Full duplex; native interruption handling; delegates reasoning/tools to a backend model (third-party allowed); telephony supported. Vendor-reported turn-taking latency 0.8s vs 1.4s for GPT-Realtime-2.1. Paid tiers only, concurrent-session limits. **Chosen.** |
| [Gemini 3.8 Live](https://www.cekura.ai/blogs/gemini-live-api-pricing) | ~$0.005/min in, ~$0.018/min out; ~$0.03/min real call (every turn re-bills session context) | Budget fallback. |
| [Hume EVI 4 mini](https://usagepricing.com/blueprint/activity/hume-ai-2026-06-30-evi-mini-octave-models) | ~$0.02–0.035/min overage + plan | Tone/expression focused; BYO LLM. Not full duplex. |
| [GPT-Realtime-2.1-mini](https://www.cekura.ai/blogs/openai-realtime-api-pricing) | ~$0.023/min cached, ~$0.13/min uncached | Turn-based. Superseded by GPT-Live-1. |
| GPT-Realtime-Whisper | $0.017/min | For "Other" dictation. |

## Classification model

TypeSafe's [Jev](https://www.edenai.co/post/jev-a-new-kind-of-ai-model-built-for-decisions-not-conversation) (released 2026-09-15) returns typed decisions with calibrated probabilities instead of text. Evaluated and **not adopted**: at one user and a few dozen decisions per day, a Haiku-class model with structured output is good enough and also writes the glance/impact text. Keep a `Classifier` interface so Jev can be swapped in later.
