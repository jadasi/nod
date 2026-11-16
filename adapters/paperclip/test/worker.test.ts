import { describe, expect, it } from 'vitest';
import plugin from '../src/worker.js';

/**
 * Paperclip's host denies company-scoped calls (config.get, secrets.resolve, approvals.*) that
 * don't name a company when the caller is a scheduled job, which has no company context. These
 * tests model that: any such call without an explicit companyId throws, as the host does.
 */
const DENIED = 'is not allowed: company context is required';

const approval = {
  id: 'ap-1',
  companyId: 'co-1',
  type: 'request_board_approval',
  status: 'pending',
  payload: { title: 'Switch the billing emails', summary: 'New template tomorrow.' },
  updatedAt: new Date('2026-11-13T18:00:00Z'),
};

const issueRow = { id: 'is-1', identifier: 'BYT-682', title: 'Karaoke player not visible' };
const interaction = {
  id: 'cf-1',
  companyId: 'co-1',
  issueId: 'is-1',
  kind: 'request_confirmation',
  status: 'pending',
  payload: { version: 1, prompt: 'Did you publish Ps 90?' },
  updatedAt: new Date('2026-11-15T18:00:00Z'),
};

function harness() {
  const jobs = new Map<string, () => Promise<void>>();
  const events = new Map<string, (e: { entityId?: string; companyId: string }) => Promise<void>>();
  const fetched: { url: string; auth: string | undefined }[] = [];
  const state = new Map<string, unknown>();
  const responded: { id: string; input: unknown }[] = [];
  const configs: Record<string, Record<string, unknown>> = {
    'co-1': { nodUrl: 'https://nod.test', agentToken: { secretId: 's' }, boardUserId: 'u-1' },
  };
  const ctx = {
    config: {
      get: async (companyId?: string) => {
        if (!companyId) throw new Error(`config.get ${DENIED}`);
        const c = configs[companyId];
        if (!c) throw new Error(`config.get ${DENIED}`); // unconfigured company
        return c;
      },
    },
    secrets: {
      resolve: async (_ref: unknown, o?: { companyId?: string }) => {
        if (!o?.companyId) throw new Error(`secrets.resolve ${DENIED}`);
        return 'tok';
      },
    },
    companies: { list: async () => [{ id: 'co-1' }, { id: 'co-2' }] },
    approvals: {
      list: async ({ companyId }: { companyId: string }) =>
        companyId === 'co-1' ? [approval] : [],
      get: async () => approval,
      decide: async () => ({ applied: true }),
    },
    state: {
      get: async (s: { stateKey: string }) => state.get(s.stateKey) ?? null,
      set: async (s: { stateKey: string }, v: unknown) => void state.set(s.stateKey, v),
      delete: async (s: { stateKey: string }) => void state.delete(s.stateKey),
    },
    http: {
      fetch: async (url: string, init: { headers: Record<string, string> }) => {
        fetched.push({ url, auth: init.headers.authorization });
        const body = url.includes('/await') ? { state: 'waiting' } : { id: 'd-1' };
        return new Response(JSON.stringify(body), { status: 200 });
      },
    },
    issues: {
      list: async ({ companyId, status }: { companyId: string; status: string }) =>
        companyId === 'co-1' && status === 'in_review' ? [issueRow] : [],
      listInteractions: async (issueId: string, companyId: string) =>
        issueId === 'is-1' && companyId === 'co-1' ? [interaction] : [],
      respondInteraction: async (_i: string, id: string, input: unknown) => {
        responded.push({ id, input });
        return { applied: true };
      },
    },
    logger: { info() {}, warn() {}, debug() {}, error() {} },
    events: { on: (name: string, fn: never) => void events.set(name, fn) },
    jobs: { register: (key: string, fn: () => Promise<void>) => void jobs.set(key, fn) },
  };
  return { ctx, jobs, events, fetched, state, configs, responded };
}

describe('worker', () => {
  it('the scheduled sync names the company, so it sends pending approvals to Nod', async () => {
    const h = harness();
    await plugin.definition.setup(h.ctx as never);
    await h.jobs.get('sync-nod')!();
    // Sent the approval, then checked for an answer; co-2 (no settings) was skipped.
    expect(h.fetched.map((f) => f.url)).toEqual([
      'https://nod.test/v1/agent/decisions',
      'https://nod.test/v1/agent/decisions',
      'https://nod.test/v1/agent/decisions/d-1/await?wait=0',
      'https://nod.test/v1/agent/decisions/d-1/await?wait=0',
    ]);
    expect(h.fetched.every((f) => f.auth === 'Bearer tok')).toBe(true);
    expect(h.state.get('link:ap-1')).toMatchObject({ decisionId: 'd-1', companyId: 'co-1' });
  });

  it('the scheduled sync also sends open issue confirmations to Nod', async () => {
    const h = harness();
    await plugin.definition.setup(h.ctx as never);
    await h.jobs.get('sync-nod')!();
    const sent = h.state.get('link:cf-1');
    expect(sent).toMatchObject({ kind: 'confirmation', issueId: 'is-1', companyId: 'co-1' });
  });

  it('fails the job run instead of reporting success when a configured company is broken', async () => {
    const h = harness();
    h.configs['co-1'] = { nodUrl: 'https://nod.test' }; // token and board user missing
    await plugin.definition.setup(h.ctx as never);
    await expect(h.jobs.get('sync-nod')!()).rejects.toThrow(/co-1/);
  });

  it('the approval.created event sends the approval using the event company', async () => {
    const h = harness();
    await plugin.definition.setup(h.ctx as never);
    await h.events.get('approval.created')!({ entityId: 'ap-1', companyId: 'co-1' });
    expect(h.fetched).toHaveLength(1);
  });
});
