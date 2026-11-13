# @nod/adapter-paperclip

A Paperclip plugin that sends board approvals to Nod and writes David's answers back.

## How it works

1. `approval.created` (and a one-minute catch-up job) sends each pending approval to Nod core as a decision (`source.system = "paperclip"`, `fingerprint = status + updatedAt`).
2. Nod holds the answer through the undo window. Paperclip is a _passive_ source in core, so the plugin does the compare-and-swap itself: when core reports the answer delivered, the plugin re-reads the approval and calls `approvals.decide` only if the fingerprint still matches.
3. If the approval is decided, revised or resubmitted in Paperclip while the card is open, the plugin withdraws the card.

Supported types: `request_board_approval`, `hire_agent`, `approve_ceo_strategy`. `budget_override_required` is skipped (Paperclip only resolves it from the Costs page).

## Options

Paperclip approvals have no `options[]`, and the board can only approve, reject or request a revision. By default the card offers Approve / Reject built from the payload's `title`, `summary`, `recommendedAction` and `risks`. An agent can put an optional `nod` block in the approval payload for custom labels. Each option still maps to approve or reject:

```json
{
  "title": "Pick a support vendor",
  "nod": {
    "impact": "Customers get answers faster; costs rise by about 10%.",
    "recommended": "vendor-a",
    "urgent": false,
    "options": [
      {
        "id": "vendor-a",
        "label": "Vendor A",
        "outcome": "Faster replies, higher cost.",
        "decision": "approve"
      },
      { "id": "keep", "label": "Keep current", "outcome": "Nothing changes.", "decision": "reject" }
    ]
  }
}
```

"Other" free text is not offered, because the plugin API cannot attach it to an approval.

## Install

Build and publish (or install from a local path) into the Paperclip instance, then set the plugin's instance config:

| Setting            | Value                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `nodUrl`           | Base URL of `nod-core`.                                                                            |
| `agentToken`       | A Paperclip secret reference to the `paperclip=` token from core's `NOD_AGENT_TOKENS`.             |
| `boardUserId`      | The board member David's answers are attributed to. Must be an active human member of the company. |
| `paperclipBaseUrl` | Optional. Public URL of Paperclip, for the "Open in Paperclip" link on cards.                      |

Core only writes to sources when `NOD_DELIVERY_MODE=live`; in `dry_run` answers are held and the plugin never sees them delivered.

## Tests

`pnpm --filter @nod/adapter-paperclip test`. `loop.test.ts` runs the adapter against the real core service and needs Postgres (`NOD_TEST_DATABASE_URL`, same as core).
