import { definePlugin, runWorker, type PluginContext } from '@paperclipai/plugin-sdk';
import { NodClient } from './nod-client.js';
import { POLL_JOB } from './manifest.js';
import { ApprovalSync } from './sync.js';
import type { ApprovalLike, ConfirmationLike, IssueRef } from './translate.js';

/** Issues that can still have an open question for David; closed issues are not asked about. */
const OPEN_ISSUE_STATUSES = ['todo', 'in_progress', 'in_review', 'blocked'] as const;
const ISSUE_PAGE = 200;

const TTL_SECONDS = 3600;

interface Config {
  nodUrl: string;
  agentToken: unknown;
  boardUserId: string;
  paperclipBaseUrl?: string;
}

/**
 * Config and secrets are company-scoped in Paperclip. Scheduled jobs carry no company context, so
 * the company is always passed explicitly: a bare `config.get()` is denied there ("company context
 * is required") and the job never runs.
 */
function toConfirmation(i: {
  id: string;
  companyId: string;
  issueId: string;
  kind: string;
  status: string;
  payload: unknown;
  updatedAt: Date | string;
  title?: string | null;
  addresseeUserId?: string | null;
  dismissedAt?: Date | string | null;
  acceptanceBlocker?: string | null;
}): ConfirmationLike {
  return {
    id: i.id,
    companyId: i.companyId,
    issueId: i.issueId,
    kind: i.kind,
    status: i.status,
    payload: (i.payload ?? {}) as Record<string, unknown>,
    updatedAt: i.updatedAt,
    title: i.title ?? null,
    addresseeUserId: i.addresseeUserId ?? null,
    dismissedAt: i.dismissedAt ?? null,
    acceptanceBlocker: i.acceptanceBlocker ?? null,
  };
}

async function loadConfig(ctx: PluginContext, companyId: string): Promise<Config | null> {
  try {
    const cfg = (await ctx.config.get(companyId)) as unknown as Config | null;
    return cfg && Object.keys(cfg).length > 0 ? cfg : null;
  } catch {
    // The host refuses config for companies the plugin has no settings for.
    return null;
  }
}

async function build(ctx: PluginContext, companyId: string): Promise<ApprovalSync> {
  const cfg = await loadConfig(ctx, companyId);
  if (!cfg || !cfg.nodUrl || !cfg.agentToken || !cfg.boardUserId) {
    throw new Error('Nod plugin is not configured (nodUrl, agentToken, boardUserId)');
  }
  const token = await ctx.secrets.resolve(cfg.agentToken as never, { companyId });
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
    confirmations: {
      listPending: async (companyId) => {
        const out: { confirmation: ConfirmationLike; issue: IssueRef }[] = [];
        for (const status of OPEN_ISSUE_STATUSES) {
          const issues = await ctx.issues.list({ companyId, status, limit: ISSUE_PAGE });
          if (issues.length >= ISSUE_PAGE) {
            ctx.logger.warn(
              'Nod: more open issues than one page; some confirmations may be missed',
              {
                companyId,
                status,
              },
            );
          }
          for (const issue of issues) {
            try {
              for (const i of await ctx.issues.listInteractions(issue.id, companyId)) {
                if (i.kind === 'request_confirmation' && i.status === 'pending') {
                  out.push({
                    confirmation: toConfirmation(i),
                    issue: { id: issue.id, identifier: issue.identifier, title: issue.title },
                  });
                }
              }
            } catch (e) {
              // One unreadable issue must not stop the others from being found.
              ctx.logger.warn('Nod: could not read confirmations for an issue', {
                issueId: issue.id,
                error: String(e),
              });
            }
          }
        }
        return out;
      },
      get: async (issueId, interactionId, companyId) => {
        const found = (await ctx.issues.listInteractions(issueId, companyId)).find(
          (i) => i.id === interactionId,
        );
        return found ? toConfirmation(found) : null;
      },
      respond: async (issueId, interactionId, companyId, input) => {
        const { applied } = await ctx.issues.respondInteraction(
          issueId,
          interactionId,
          input,
          companyId,
        );
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
      if (a) await (await build(ctx, event.companyId)).onApproval(a as ApprovalLike);
    });
    ctx.events.on('approval.decided', async (event) => {
      const a = await ctx.approvals.get(event.entityId ?? '', event.companyId);
      if (a) await (await build(ctx, event.companyId)).onDecided(a as ApprovalLike);
    });
    ctx.jobs.register(POLL_JOB, async () => {
      const failures: string[] = [];
      for (const company of await ctx.companies.list()) {
        // Companies this plugin has no settings for are expected; skip them quietly.
        if (!(await loadConfig(ctx, company.id))) {
          ctx.logger.debug('Nod sync skipped: company has no settings', { companyId: company.id });
          continue;
        }
        try {
          const sync = await build(ctx, company.id);
          // Independent steps: a problem finding new items must not stop answers being applied.
          for (const step of [() => sync.sweep([company.id]), () => sync.poll(company.id)]) {
            try {
              await step();
            } catch (e) {
              failures.push(`${company.id}: ${String(e)}`);
            }
          }
        } catch (e) {
          failures.push(`${company.id}: ${String(e)}`);
        }
      }
      // Fail the run (visible in job history) rather than reporting success after doing nothing.
      if (failures.length > 0) throw new Error(`Nod sync failed for ${failures.join('; ')}`);
    });
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
