import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex } from '../apps/web/player.js';
import { NoChargeAccounting } from '../packages/domain/accounting.js';
test('continuous selection advances and stops at end unless repeat-all is selected', () => {
  assert.equal(nextIndex({ length: 3, current: 0, ended: true }), 1);
  assert.equal(nextIndex({ length: 3, current: 2, ended: true }), -1);
  assert.equal(nextIndex({ length: 3, current: 2, repeat: 'all', ended: true }), 0);
  assert.equal(nextIndex({ length: 3, current: 0, direction: -1, repeat: 'all' }), 2);
});
test('repeat-one repeats on end but manual selection can advance', () => {
  assert.equal(nextIndex({ length: 3, current: 1, repeat: 'one', ended: true }), 1);
  assert.equal(nextIndex({ length: 3, current: 1, repeat: 'one' }), 2);
});
test('shuffle selects a different valid track; empty and singleton queues work', () => {
  for (let current=0;current<3;current++) for (const random of [() => 0, () => 0.99]) {
    const next=nextIndex({ length: 3, current, shuffle: true, random });
    assert.notEqual(next,current); assert.ok(next>=0 && next<3);
  }
  assert.equal(nextIndex({ length: 0, current: -1 }), -1);
  assert.equal(nextIndex({ length: 1, current: 0, shuffle: true }), -1);
});
test('accounting boundary authorizes without creating charges or browser leases', async () => {
  const accounting = new NoChargeAccounting();
  assert.deepEqual(await accounting.authorizePlayback({ listenerId: 'listener', trackId: 'track' }), { allowed: true, mode: 'disabled', chargesEnabled: false });
  await assert.rejects(accounting.authorizePlayback({}), /identity/);
});
