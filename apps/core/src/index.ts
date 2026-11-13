import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { EventHub } from './events.js';
import { startJobs } from './jobs.js';
import { DecisionService } from './service.js';
import { AdapterRegistry } from './source.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createPool(config.databaseUrl);
  const applied = await migrate(db);
  if (applied.length) console.log(`applied migrations: ${applied.join(', ')}`);

  const hub = new EventHub(config.databaseUrl);
  await hub.start();
  // Source adapters (Paperclip, ...) register here as they land. Until then sources are passive:
  // agents poll await_decision and verify the returned fingerprint themselves.
  const service = new DecisionService(db, new AdapterRegistry(), config);
  const stopJobs = startJobs(service, config);
  const app = createApp({ config, db, service, hub });

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`nod-core listening on :${info.port} (delivery mode: ${config.deliveryMode})`);
  });
  const shutdown = (): void => {
    stopJobs();
    server.close();
    void hub
      .stop()
      .then(() => db.end())
      .then(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
