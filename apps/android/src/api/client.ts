import { createSseParser, parseNodEvent, type ParsedNodEvent } from './sse.js';
import { ApiError, type DecisionView, type StatusView, type UpdateRow } from './types.js';

/** The app identifies itself as the `android` surface on every action. */
const SURFACE = 'android';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface NodClientOptions {
  /** Base URL of nod-core, e.g. `https://nod-core.up.railway.app`. */
  baseUrl: string;
  /** David's device token. Never logged, never sent anywhere but core. */
  token: string;
  /** Injectable for tests. */
  fetchImpl?: FetchLike;
}

export class NodClient {
  private readonly base: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: NodClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(this.base + path, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let code = 'http';
      let message = `Request failed (${res.status})`;
      try {
        const err = (await res.json()) as { error?: { code?: string; message?: string } };
        if (err.error?.code) code = err.error.code;
        if (err.error?.message) message = err.error.message;
      } catch {
        // Non-JSON error body; keep the default.
      }
      throw new ApiError(code, res.status, message);
    }
    return (await res.json()) as T;
  }

  status(): Promise<StatusView> {
    return this.request<StatusView>('GET', '/v1/status');
  }

  decisions(view: 'inbox' | 'repair' | 'all' = 'inbox'): Promise<DecisionView[]> {
    return this.request<{ decisions: DecisionView[] }>('GET', `/v1/decisions?view=${view}`).then(
      (b) => b.decisions,
    );
  }

  decision(id: string): Promise<DecisionView> {
    return this.request<DecisionView>('GET', `/v1/decisions/${encodeURIComponent(id)}`);
  }

  history(id: string): Promise<Record<string, unknown>[]> {
    return this.request<{ history: Record<string, unknown>[] }>(
      'GET',
      `/v1/decisions/${encodeURIComponent(id)}/history`,
    ).then((b) => b.history);
  }

  answer(id: string, payload: { optionId?: string; otherText?: string }): Promise<DecisionView> {
    const body: Record<string, unknown> = { surface: SURFACE };
    if (payload.optionId !== undefined) body.option_id = payload.optionId;
    if (payload.otherText !== undefined) body.other_text = payload.otherText;
    return this.request<DecisionView>(
      'POST',
      `/v1/decisions/${encodeURIComponent(id)}/answer`,
      body,
    );
  }

  undo(id: string): Promise<DecisionView> {
    return this.request<DecisionView>('POST', `/v1/decisions/${encodeURIComponent(id)}/undo`, {
      surface: SURFACE,
    });
  }

  reask(id: string): Promise<DecisionView> {
    return this.request<DecisionView>('POST', `/v1/decisions/${encodeURIComponent(id)}/reask`, {
      surface: SURFACE,
    });
  }

  refresh(id: string): Promise<DecisionView> {
    return this.request<DecisionView>('POST', `/v1/decisions/${encodeURIComponent(id)}/refresh`, {
      surface: SURFACE,
    });
  }

  withdraw(id: string): Promise<DecisionView> {
    return this.request<DecisionView>('POST', `/v1/decisions/${encodeURIComponent(id)}/withdraw`, {
      surface: SURFACE,
    });
  }

  updates(limit = 50): Promise<UpdateRow[]> {
    return this.request<{ updates: UpdateRow[] }>('GET', `/v1/updates?limit=${limit}`).then(
      (b) => b.updates,
    );
  }

  /**
   * Follows the SSE stream and dispatches typed events. Reconnects with
   * backoff (1s..30s) on drops; a `resync` event marks a gap, so callers
   * re-fetch their lists when they see it. Returns a close function.
   */
  openEvents(
    onEvent: (e: ParsedNodEvent) => void,
    opts: { fetchImpl?: FetchLike; signal?: AbortSignal; maxDelayMs?: number } = {},
  ): () => void {
    const impl = opts.fetchImpl ?? this.fetchImpl;
    const maxDelay = opts.maxDelayMs ?? 30_000;
    const controller = new AbortController();
    let stopped = false;
    let delay = 1_000;
    const onOuterAbort = (): void => controller.abort();
    opts.signal?.addEventListener('abort', onOuterAbort);

    const run = async (): Promise<void> => {
      while (!stopped) {
        try {
          const res = await impl(this.base + '/v1/events', {
            headers: { authorization: `Bearer ${this.token}` },
            signal: controller.signal,
          });
          if (res.status === 401) return; // Bad token: the app signs the user out.
          if (!res.ok || !res.body) throw new Error(`events stream ${res.status}`);
          delay = 1_000;
          const reader = res.body.getReader();
          const parse = createSseParser();
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const frame of parse(decoder.decode(value, { stream: true }))) {
              const ev = parseNodEvent(frame);
              if (ev) onEvent(ev);
            }
          }
        } catch {
          if (stopped) return;
        }
        if (stopped) return;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(maxDelay, delay * 2);
      }
    };

    void run();
    return () => {
      stopped = true;
      opts.signal?.removeEventListener('abort', onOuterAbort);
      controller.abort();
    };
  }
}
