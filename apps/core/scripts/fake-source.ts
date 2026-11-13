/**
 * A fake source for proving the loop end to end (web inbox -> answer -> undo window -> delivery)
 * without a real agent. It behaves like an agent: submits decisions with an agent token, then
 * long-polls await_decision and prints what happened.
 *
 *   NOD_URL=http://localhost:8080 NOD_AGENT_TOKEN=... pnpm --filter @nod/core fake-source [flags]
 *
 * Flags: --count N (default 1), --urgent, --external, --no-wait (submit and exit).
 * Decisions are filed under the contract's `other` system, so the token must be `other=<token>` in NOD_AGENT_TOKENS.
 */
const base = (process.env.NOD_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const token = process.env.NOD_AGENT_TOKEN;
if (!token) {
  console.error('Set NOD_AGENT_TOKEN to an agent token from NOD_AGENT_TOKENS.');
  process.exit(1);
}
const args = process.argv.slice(2);
const flag = (n: string): boolean => args.includes(`--${n}`);
const count = Number(args[args.indexOf('--count') + 1]) || 1;
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

async function call(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function runOne(n: number): Promise<void> {
  const run = Date.now().toString(36);
  const external = flag('external');
  const { id } = (await call('/v1/agent/decisions', {
    method: 'POST',
    body: JSON.stringify({
      idempotency_key: `fake-${run}-${n}`,
      source: { system: 'other', agent: 'fake-source', ref: `fake-${run}-${n}` },
      provenance: external
        ? { kind: 'external', origin: 'someone@example.com' }
        : { kind: 'internal' },
      glance: { title: `Fake decision ${n}`, question: 'Roll out the new onboarding flow?' },
      impact:
        'New sign-ups would see a shorter onboarding flow starting tomorrow. About 40 people a week are affected.',
      options: [
        {
          id: 'roll_out',
          label: 'Roll out',
          outcome: 'Everyone new sees the shorter flow.',
          reversible: true,
          writes: true,
        },
        {
          id: 'hold',
          label: 'Hold',
          outcome: 'Nothing changes for anyone.',
          reversible: true,
          writes: false,
        },
      ],
      recommended: 'hold',
      urgency: flag('urgent') ? 'urgent' : 'normal',
      fingerprint: 'rev-1',
      evidence: [
        { kind: 'text', label: 'Diff summary', text: 'onboarding.ts: 3 steps -> 2 steps' },
      ],
      ttl_seconds: 3600,
    }),
  })) as { id: string };
  console.log(`[${n}] submitted ${id}`);
  if (flag('no-wait')) return;
  for (;;) {
    const r = await call(`/v1/agent/decisions/${id}/await?wait=20`);
    if (r.state === 'waiting') continue;
    console.log(
      `[${n}] ${String(r.state)}`,
      r.answer ? JSON.stringify(r.answer) : (r.reason ?? ''),
    );
    return;
  }
}

await Promise.all(Array.from({ length: count }, (_, i) => runOne(i + 1)));
