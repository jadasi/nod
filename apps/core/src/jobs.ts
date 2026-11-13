import type { Config } from './config.js';
import type { DecisionService } from './service.js';

/** Background loops: outcome writer, expiry and defaults, reconciler. Safe across instances. */
export function startJobs(service: DecisionService, config: Config): () => void {
  const timers: NodeJS.Timeout[] = [];
  const every = (name: string, seconds: number, fn: () => Promise<unknown>): void => {
    let running = false;
    const run = async (): Promise<void> => {
      if (running) return;
      running = true;
      try {
        await fn();
      } catch (err) {
        console.error(`job ${name} failed`, err);
      } finally {
        running = false;
      }
    };
    timers.push(setInterval(() => void run(), seconds * 1000));
  };
  every('writer', config.writerTickSeconds, () => service.deliverDue());
  every('expiry', config.expiryTickSeconds, async () => {
    await service.expireDue();
    await service.applyDefaultsDue();
  });
  every('reconciler', config.reconcilerIntervalSeconds, () => service.reconcile());
  return () => timers.forEach(clearInterval);
}
