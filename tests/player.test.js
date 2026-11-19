/*
The contents of this file are subject to the Common Public Attribution License Version 1.0 (CPAL-1.0); you may not use it except in compliance with the License. Obtain the License at https://opensource.org/license/CPAL-1.0 or see LICENSE. CPAL is based on MPL 1.1, with Sections 14 and 15 added for attribution and network use.
Original Code: Musixene Artist Platform. Original Developer and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC). Portions written by Musixene: Copyright (c) 2026 Musixene. All Rights Reserved. Software is provided AS IS, WITHOUT WARRANTY OF ANY KIND.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, PlaybackQueue } from '../apps/web/player.js';
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

test('catalog browsing leaves the established queue intact; explicit selection snapshots order and repeat/shuffle stay coherent',()=>{
  const q=new PlaybackQueue(),catalog=['a','b','c'];q.select(catalog,'b','First catalog');catalog.push('later');
  const browsed=['c','d'];assert.equal(q.currentId,'b');assert.equal(q.next(),'c');assert.deepEqual(q.ids,['a','b','c']);
  assert.equal(q.next({direction:-1}),'a');assert.equal(q.next({repeat:'one',ended:true}),'b');
  q.currentId='c';assert.equal(q.next(),null);assert.equal(q.next({repeat:'all'}),'a');
  q.select(browsed,'c','Second catalog');assert.equal(q.next(),'d');assert.equal(q.title,'Second catalog');
  q.select(['a','a','b'],'a','Deduplicated');assert.deepEqual(q.ids,['a','b']);assert.equal(q.next({shuffle:true,random:()=>0}),'b');
});
