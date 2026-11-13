import { afterAll, beforeAll, expect, it } from 'vitest';
import { events, harness, request, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterAll(() => h.db.end());

it('loop: request → answer → undo → answer → window elapses → fingerprint check → delivery', async () => {
  h.source.set('approval-1', 'rev-1');
  const { id } = await h.service.submit('paperclip', request());

  await h.service.answer(id, { option_id: 'wait', surface: 'android' });
  h.clock.advance(30);
  await h.service.undo(id, 'android'); // changed his mind
  await h.service.answer(id, { option_id: 'ship', surface: 'android' });

  h.clock.advance(100); // still inside the second window
  expect(await h.service.deliverDue()).toBe(0);
  h.clock.advance(21); // window ends; source unchanged
  expect(await h.service.deliverDue()).toBe(1);

  expect(h.source.delivered).toEqual([
    expect.objectContaining({ optionId: 'ship', idempotencyKey: `${id}:2`, fingerprint: 'rev-1' }),
  ]);
  const res = await h.service.awaitResult('paperclip', id);
  expect(res).toMatchObject({
    state: 'delivered',
    answer: { option_id: 'ship', fingerprint: 'rev-1' },
  });
  expect(await events(h.db, id)).toEqual([
    'created',
    'answered',
    'undone',
    'answered',
    'delivered',
  ]);
});
