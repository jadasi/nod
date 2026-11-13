import type { PaperclipPluginManifestV1 } from '@paperclipai/plugin-sdk';

export const POLL_JOB = 'sync-nod';

const manifest: PaperclipPluginManifestV1 = {
  id: 'nod.decision-router',
  apiVersion: 1,
  version: '0.1.0',
  displayName: 'Nod',
  description:
    'Sends board approvals to Nod, where they can be answered from a phone, and writes the answer back after an undo window.',
  author: 'Nod',
  categories: ['connector'],
  capabilities: [
    'companies.read',
    'approvals.read',
    'approvals.respond',
    'events.subscribe',
    'jobs.schedule',
    'http.outbound',
    'secrets.read-ref',
    'plugin.state.read',
    'plugin.state.write',
  ],
  entrypoints: { worker: 'dist/worker.js' },
  instanceConfigSchema: {
    type: 'object',
    required: ['nodUrl', 'agentToken', 'boardUserId'],
    properties: {
      nodUrl: { type: 'string', description: 'Base URL of the Nod core service.' },
      agentToken: {
        type: 'object',
        description: 'Secret reference holding the Nod agent token for source "paperclip".',
      },
      boardUserId: {
        type: 'string',
        description: 'Board member that answers made in Nod are attributed to in Paperclip.',
      },
      paperclipBaseUrl: {
        type: 'string',
        description:
          'Optional. Public URL of this Paperclip, used for the "Open in Paperclip" link on cards.',
      },
    },
  },
  jobs: [
    {
      jobKey: POLL_JOB,
      displayName: 'Sync with Nod',
      description: 'Re-sends missed approvals, applies answers whose undo window has passed.',
      schedule: '* * * * *',
    },
  ],
};

export default manifest;
