# @nod/core

Hono service on Node 22: REST + SSE + MCP, Postgres decision store with an append-only audit log, and the outcome writer (undo window, fingerprint revalidation, idempotency, compare-and-swap).

## Configuration (environment variables)

| Variable                                                 | Required | Notes                                                                                                                   |
| -------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | yes      | Railway Postgres reference. Migrations run on start.                                                                    |
| `NOD_DEVICE_TOKEN`                                       | yes      | David's device token (>= 16 chars). Used on `/v1/*`.                                                                    |
| `NOD_AGENT_TOKENS`                                       | no       | `system=token,...`, e.g. `paperclip=…,hermes=…`. Each token acts for one source only. Used on `/v1/agent/*` and `/mcp`. |
| `NOD_DELIVERY_MODE`                                      | no       | `dry_run` (default) or `live`. `dry_run` holds answers and logs instead of writing to sources.                          |
| `NOD_UNDO_WINDOW_SECONDS`                                | no       | Default 120.                                                                                                            |
| `NOD_MAX_DELIVERY_ATTEMPTS`, `NOD_RETRY_BACKOFF_SECONDS` | no       | Defaults 3 and 30.                                                                                                      |
| `NOD_RECONCILER_INTERVAL_SECONDS`                        | no       | Default 300.                                                                                                            |

## API

Agents (`Authorization: Bearer <agent token>`): `POST /v1/agent/decisions`, `GET /v1/agent/decisions/:id/await?wait=20`, `POST /v1/agent/decisions/:id/heartbeat`, `POST /v1/agent/decisions/:id/withdraw`, `POST /v1/agent/updates`, and MCP at `/mcp` (tools `request_decision`, `await_decision`, `notify`, `report_progress`, `heartbeat_decision`, `withdraw_decision`).

David's devices (`Authorization: Bearer <device token>`): `GET /v1/decisions?view=inbox|repair|all`, `GET /v1/decisions/:id`, `GET /v1/decisions/:id/history`, `POST /v1/decisions/:id/{answer,undo,withdraw,reask,refresh}`, `GET /v1/updates`, `GET /v1/events` (SSE), `GET /v1/status`.

`GET /healthz` is open (database check).

## Tests

Integration tests need a real Postgres: `NOD_TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/nod_test`). They drop and recreate the `public` schema of that database.

## Web inbox

`nod-core` serves the bare web inbox (`apps/web/public`, plain static files, no build step) at `/`. The files hold no data; decisions come from `/v1/*`, which needs the device token. Open the service URL, enter `NOD_DEVICE_TOKEN` once (it is kept in that browser's local storage), and use "Add to Home screen" to install it as a PWA. See `apps/web/README.md`.

## Fake source

`pnpm --filter @nod/core fake-source` plays an agent: it files a decision, then long-polls for the answer and prints it. Use it to prove the loop (request → answer in the web inbox → undo window → delivery → agent receives the answer).

```
NOD_URL=http://localhost:8080 NOD_AGENT_TOKEN=<token> pnpm --filter @nod/core fake-source --count 2 [--urgent] [--external] [--no-wait]
```

Decisions are filed under the contract's `other` system, so the token must be configured as `other=<token>` in `NOD_AGENT_TOKENS`. In `dry_run` delivery mode the answer is held, so the script keeps waiting; switch to `live` (passive source, nothing is written anywhere) to see it complete.
