export type DeliveryMode = 'live' | 'dry_run';

export interface Config {
  port: number;
  databaseUrl: string;
  /** Token the single user's devices present. */
  deviceToken: string;
  /** Scoped tokens: token -> the one source system it may act for. */
  agentTokens: Map<string, string>;
  /** `dry_run` is the kill switch: the outcome writer logs instead of writing to sources. */
  deliveryMode: DeliveryMode;
  undoWindowSeconds: number;
  /** Per decision type (source system) overrides of the undo window. */
  undoWindowBySource: Record<string, number>;
  maxDeliveryAttempts: number;
  retryBackoffSeconds: number;
  reconcilerIntervalSeconds: number;
  writerTickSeconds: number;
  expiryTickSeconds: number;
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${key} must be a non-negative integer`);
  return n;
}

/** NOD_AGENT_TOKENS is a comma list of `system=token`, e.g. `paperclip=abc,hermes=def`. */
export function parseAgentTokens(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (raw ?? '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    const system = trimmed.slice(0, eq);
    const token = trimmed.slice(eq + 1);
    if (eq < 1 || token.length < 16) {
      throw new Error('NOD_AGENT_TOKENS entries must look like system=token (token >= 16 chars)');
    }
    map.set(token, system);
  }
  return map;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.NOD_DELIVERY_MODE ?? 'dry_run';
  if (mode !== 'live' && mode !== 'dry_run') {
    throw new Error('NOD_DELIVERY_MODE must be "live" or "dry_run"');
  }
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const deviceToken = env.NOD_DEVICE_TOKEN;
  if (!deviceToken || deviceToken.length < 16) {
    throw new Error('NOD_DEVICE_TOKEN is required (at least 16 characters)');
  }
  return {
    port: int(env, 'PORT', 8080),
    databaseUrl,
    deviceToken,
    agentTokens: parseAgentTokens(env.NOD_AGENT_TOKENS),
    deliveryMode: mode,
    undoWindowSeconds: int(env, 'NOD_UNDO_WINDOW_SECONDS', 120),
    undoWindowBySource: {},
    maxDeliveryAttempts: int(env, 'NOD_MAX_DELIVERY_ATTEMPTS', 3),
    retryBackoffSeconds: int(env, 'NOD_RETRY_BACKOFF_SECONDS', 30),
    reconcilerIntervalSeconds: int(env, 'NOD_RECONCILER_INTERVAL_SECONDS', 300),
    writerTickSeconds: int(env, 'NOD_WRITER_TICK_SECONDS', 5),
    expiryTickSeconds: int(env, 'NOD_EXPIRY_TICK_SECONDS', 30),
  };
}
