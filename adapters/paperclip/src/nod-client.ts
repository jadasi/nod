import type { AwaitResult, NodPort } from './sync.js';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class NodHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Nod's agent REST API, authenticated with this source's scoped agent token. */
export class NodClient implements NodPort {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetch: Fetch,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/agent${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      // Never echo headers or the token; the body is Nod's own error message.
      throw new NodHttpError(
        res.status,
        `Nod ${method} ${path} failed with ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }
    return (await res.json()) as T;
  }

  submit(request: unknown): Promise<{ id: string }> {
    return this.call('POST', '/decisions', request);
  }

  await(decisionId: string): Promise<AwaitResult> {
    return this.call('GET', `/decisions/${encodeURIComponent(decisionId)}/await?wait=0`);
  }

  async withdraw(decisionId: string, reason: string): Promise<void> {
    await this.call('POST', `/decisions/${encodeURIComponent(decisionId)}/withdraw`, { reason });
  }
}
