import { definePlugin, runWorker, type PluginContext } from '@paperclipai/plugin-sdk';
import { NodClient } from './nod-client.js';
import { POLL_JOB } from './manifest.js';
import { ApprovalSync } from './sync.js';
import type { ApprovalLike } from './translate.js';

const TTL_SECONDS = 3600;

interface Config {
  nodUrl: string;
  agentToken: unknown;
  boardUserId: string;
  paperclipBaseUrl?: string;
}

async function build(ctx: PluginContext): Promise<ApprovalSync> {
  const cfg = (await ctx.config.get()) as unknown as Config;
  if (!cfg.nodUrl || !cfg.agentToken || !cfg.boardUserId) {
    throw new Error('Nod plugin is not configured (nodUrl, agentToken, boardUserId)');
  }
  const token = await ctx.secrets.resolve(cfg.agentToken as never);
  const scope = (stateKey: string) => ({ scopeKind: 'instance' as const, stateKey });
  return new ApprovalSync({
    nod: new NodClient(cfg.nodUrl, token, (url, init) => ctx.http.fetch(url, init)),
    approvals: {
      listPending: (companyId) => ctx.approvals.list({ companyId, status: 'pending' }),
      get: (id, companyId) => ctx.approvals.get(id, companyId),
      decide: async (id, companyId, input) => {
        const { applied } = await ctx.approvals.decide(id, input, companyId);
        return { applied };
      },
    },
    state: {
      get: (k) => ctx.state.get(scope(k)),
      set: (k, v) => ctx.state.set(scope(k), v),
      delete: (k) => ctx.state.delete(scope(k)),
    },
    log: ctx.logger,
    actorUserId: cfg.boardUserId,
    baseUrl: cfg.paperclipBaseUrl,
    ttlSeconds: TTL_SECONDS,
  });
}

const plugin = definePlugin({
  async setup(ctx) {
    // Events are the fast path; the job below is the safety net for anything missed.
    ctx.events.on('approval.created', async (event) => {
      const a = await ctx.approvals.get(event.entityId ?? '', event.companyId);
      if (a) await (await build(ctx)).onApproval(a as ApprovalLike);
    });
    ctx.events.on('approval.decided', async (event) => {
      const a = await ctx.approvals.get(event.entityId ?? '', event.companyId);
      if (a) await (await build(ctx)).onDecided(a as ApprovalLike);
    });
    ctx.jobs.register(POLL_JOB, async () => {
      const sync = await build(ctx);
      const companies = await ctx.companies.list();
      await sync.sweep(companies.map((c) => c.id));
      await sync.poll();
    });
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
