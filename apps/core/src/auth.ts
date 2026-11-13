import { createHash, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { Config } from './config.js';
import { NodError } from './errors.js';

export type Variables = { system: string };

const digest = (s: string): Buffer => createHash('sha256').update(s).digest();

export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function bearer(header: string | undefined | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return m?.[1] ?? null;
}

/** Resolves an agent token to the one source system it may act for. */
export function systemForToken(config: Config, token: string | null): string | null {
  if (!token) return null;
  let found: string | null = null;
  // Compare against every token so timing doesn't reveal which one matched.
  for (const [t, system] of config.agentTokens) {
    if (safeEqual(t, token)) found = system;
  }
  return found;
}

/** The single user's devices. Agent tokens never work here. */
export function deviceAuth(config: Config): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    const token = bearer(c.req.header('authorization'));
    if (!token || !safeEqual(token, config.deviceToken)) {
      throw new NodError('unauthorized', 'Missing or invalid device token');
    }
    await next();
  };
}

/** Scoped per-source tokens for agents. The device token never works here. */
export function agentAuth(config: Config): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    const system = systemForToken(config, bearer(c.req.header('authorization')));
    if (!system) throw new NodError('unauthorized', 'Missing or invalid agent token');
    c.set('system', system);
    await next();
  };
}
