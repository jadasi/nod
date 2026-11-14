# @nod/web

The bare web inbox: a PWA, plain HTML/JS/CSS with no build step, served by `@nod/core` at `/`.

- Inbox (urgent first), impact-first detail, options as outcomes, "Other" free text.
- Live undo countdown ("Sending in 1:47 · Undo"), default-on-silence countdown, "checked Ns ago" with Refresh.
- Stale & conflicts queue (re-ask, refresh, withdraw) and an Updates tab.
- Live updates over the `/v1/events` SSE stream, read with `fetch` because `EventSource` can't send the token header. Reconnects with backoff and resyncs.
- Authenticates with the device token, stored only in the browser's local storage.
- Agent-supplied text is rendered with `textContent` only and the page has a strict CSP.

Styled with the **Phosphor** design system (`packages/design-tokens`): `tokens.css` and `tokens.js` are generated from `tokens.json`, the pixel icons and the pixel font, so don't edit them by hand. `style.css` uses only those tokens. `/design.html` is a reference page for every token, icon and component (static demo content, no token or data).

Develop by running core (`pnpm --filter @nod/core dev`) and editing `public/`; core reads the files from disk on every request. `lib.js` holds the pure logic and `pixel.js` the pixel-font layout; both are unit tested, as is the service worker's file list (`pnpm --filter @nod/web test`).
