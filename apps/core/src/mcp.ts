import { decisionSchema } from '@nod/contract';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { NodError } from './errors.js';
import type { EventHub } from './events.js';
import type { DecisionService } from './service.js';

// MCP clients validate tool schemas themselves; $id/$schema only get in the way.
const requestSchema = Object.fromEntries(
  Object.entries(decisionSchema).filter(([k]) => k !== '$schema' && k !== '$id'),
);

const idProp = { type: 'string', description: 'Decision id returned by request_decision.' };

export const TOOLS = [
  {
    name: 'request_decision',
    description:
      'Ask David for a decision instead of blocking in your own UI. Phrase it by effect on people, ' +
      'not technical detail. Returns a decision id; then call await_decision. Anything that writes ' +
      '(send, deploy, delete, spend, modify) must be an option with writes: true.',
    inputSchema: requestSchema,
  },
  {
    name: 'await_decision',
    description:
      "Wait for David's answer (up to wait_seconds, then call again). Also keeps the request alive. " +
      'state "delivered" carries the answer and the fingerprint it was checked against: verify your ' +
      'own preconditions against it before acting. "stale"/"reask": re-submit with a fresh fingerprint.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['decision_id'],
      properties: {
        decision_id: idProp,
        wait_seconds: { type: 'integer', minimum: 0, maximum: 50, default: 20 },
      },
    },
  },
  {
    name: 'notify',
    description: 'Tell David something that needs no answer. Shows in the Updates tab.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string', maxLength: 120 },
        body: { type: 'string', maxLength: 2000 },
        level: { type: 'string', enum: ['info', 'warn', 'error'], default: 'info' },
        project: { type: 'string' },
        ref: { type: 'string' },
        url: { type: 'string', format: 'uri' },
      },
    },
  },
  {
    name: 'report_progress',
    description: 'Report progress on a piece of work. Shows in the Updates tab.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string', maxLength: 120 },
        body: { type: 'string', maxLength: 2000 },
        project: { type: 'string' },
        ref: { type: 'string' },
        url: { type: 'string', format: 'uri' },
      },
    },
  },
  {
    name: 'heartbeat_decision',
    description: 'Keep a pending request alive. Requests expire if the agent stops heartbeating.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['decision_id'],
      properties: { decision_id: idProp },
    },
  },
  {
    name: 'withdraw_decision',
    description: 'Withdraw your own pending request when you no longer need an answer.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['decision_id'],
      properties: { decision_id: idProp, reason: { type: 'string', maxLength: 200 } },
    },
  },
] as const;

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || v === '')
    throw new NodError('invalid_request', `${name} is required`);
  return v;
};
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export async function awaitDecision(
  service: DecisionService,
  hub: EventHub,
  system: string,
  id: string,
  waitSeconds: number,
  signal?: AbortSignal,
) {
  const deadline = Date.now() + Math.min(Math.max(waitSeconds, 0), 50) * 1000;
  await service.touchFromAwait(system, id);
  for (;;) {
    const result = await service.awaitResult(system, id);
    const remaining = deadline - Date.now();
    if (result.state !== 'waiting' || remaining <= 0 || signal?.aborted) return result;
    // Wake on a change event, or re-check every 5s in case a notification was missed.
    await hub.waitFor(
      (e) => e.type === 'decision' && (e.id === id || e.id === '*'),
      Math.min(remaining, 5000),
      signal,
    );
  }
}

export async function callTool(
  service: DecisionService,
  hub: EventHub,
  system: string,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  switch (name) {
    case 'request_decision':
      return service.submit(system, args);
    case 'await_decision': {
      const wait = typeof args.wait_seconds === 'number' ? args.wait_seconds : 20;
      return awaitDecision(
        service,
        hub,
        system,
        str(args.decision_id, 'decision_id'),
        wait,
        signal,
      );
    }
    case 'notify':
      return service.addUpdate(system, {
        kind: 'notify',
        title: str(args.title, 'title'),
        body: optStr(args.body),
        level: (['info', 'warn', 'error'] as const).find((l) => l === args.level),
        project: optStr(args.project),
        ref: optStr(args.ref),
        url: optStr(args.url),
      });
    case 'report_progress':
      return service.addUpdate(system, {
        kind: 'progress',
        title: str(args.title, 'title'),
        body: optStr(args.body),
        project: optStr(args.project),
        ref: optStr(args.ref),
        url: optStr(args.url),
      });
    case 'heartbeat_decision':
      return service.heartbeat(system, str(args.decision_id, 'decision_id'));
    case 'withdraw_decision':
      await service.withdraw(system, str(args.decision_id, 'decision_id'), optStr(args.reason));
      return { ok: true };
    default:
      throw new NodError('invalid_request', `Unknown tool "${name}"`);
  }
}

/** Stateless MCP over streamable HTTP: one short-lived server per request, scoped to the token's source. */
export async function handleMcp(
  service: DecisionService,
  hub: EventHub,
  system: string,
  request: Request,
): Promise<Response> {
  const server = new Server({ name: 'nod', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...TOOLS] }));
  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    try {
      const out = await callTool(
        service,
        hub,
        system,
        req.params.name,
        (req.params.arguments ?? {}) as Record<string, unknown>,
        extra.signal,
      );
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (err) {
      if (err instanceof NodError) {
        const text = [err.message, ...err.details].join('\n');
        return { isError: true, content: [{ type: 'text', text }] };
      }
      console.error('mcp tool failed', err);
      return { isError: true, content: [{ type: 'text', text: 'Internal error' }] };
    }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
