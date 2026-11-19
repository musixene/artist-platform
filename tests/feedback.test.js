/*
 * The contents of this file are subject to the Common Public Attribution License Version 1.0
 * (CPAL-1.0); you may not use this file except in compliance with the License.
 * Obtain the License at https://opensource.org/license/CPAL-1.0 or see LICENSE.
 * The License is based on MPL 1.1; CPAL Sections 14 and 15 address attribution and network use.
 * Software distributed under the License is supplied AS IS, WITHOUT WARRANTY OF ANY KIND.
 * Original Code: Musixene Artist Platform.
 * Original and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC).
 * Portions written by Musixene: Copyright (c) 2026 Musixene. All Rights Reserved.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { openDatabase } from '../apps/server/database.js';
import { fixture } from './fixture.js';

test('likes are idempotent, durable and private; hidden tracks and authorization are enforced',async t=>{
  const f=await fixture(t),alice=await f.login('alice'),bob=await f.login('bob'),id=f.tracks[0].id,path=`/api/feedback/tracks/${id}`;
  assert.equal((await f.request(path)).status,401);
  assert.equal((await f.request(path+'/like',{liked:true},alice,{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await f.request(path+'/like',{liked:true},alice,{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.request(path+'/like',{liked:'true'},alice)).status,400);
  const responses=await Promise.all([1,2,3].map(()=>f.request(path+'/like',{liked:true,user_id:bob.user.id},alice)));
  assert.ok(responses.every(r=>r.status===200));assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_likes').get().n,1);
  const reopened=openDatabase(f.directory);assert.equal(reopened.prepare('SELECT user_id FROM track_likes').get().user_id,alice.user.id);reopened.close();
  assert.equal((await (await f.request(path,undefined,alice)).json()).liked,true);
  assert.equal((await (await f.request(path,undefined,bob)).json()).liked,false);
  assert.equal((await f.request('/api/admin/feedback',undefined,alice)).status,403);
  assert.equal((await f.request('/api/admin/feedback/export',undefined,bob)).status,403);
  assert.equal((await (await f.request('/api/tracks',undefined,alice)).json()).tracks[0].liked,1);
  assert.equal((await (await f.request('/api/tracks',undefined,bob)).json()).tracks[0].liked,0);
  await f.request(path+'/like',{liked:false},alice);await f.request(path+'/like',{liked:false},alice);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_likes').get().n,0);
  f.db.prepare('UPDATE tracks SET visible=0 WHERE id=?').run(id);
  assert.equal((await f.request(path+'/like',{liked:true},alice)).status,404);
  f.db.prepare('UPDATE users SET disabled=1 WHERE id=?').run(bob.user.id);
  assert.equal((await f.request(path,undefined,bob)).status,401);
});

test('notes validate text, resist request retries and isolate authors while allowing administrator review/removal',async t=>{
  const f=await fixture(t),alice=await f.login('alice'),bob=await f.login('bob'),admin=await f.login('artist'),id=f.tracks[0].id,path=`/api/feedback/tracks/${id}`;
  for(const body of ['', '   ', 'x'.repeat(2001), String.fromCharCode(0)])assert.equal((await f.request(path+'/notes',{body,requestId:randomUUID()},alice)).status,400);
  const text='<script>window.noteExecuted=true</script> A private note 🎵',requestId=randomUUID();
  const responses=await Promise.all([1,2].map(()=>f.request(path+'/notes',{body:text,requestId,user_id:bob.user.id},alice)));
  assert.ok(responses.every(r=>r.status===201));const note=(await responses[0].json()).note;
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_notes').get().n,1);
  assert.equal((await f.request(path+'/notes',{body:'Changed',requestId},alice)).status,409);
  assert.equal((await (await f.request(path,undefined,bob)).json()).notes.length,0);
  assert.equal((await (await f.request(path,undefined,alice)).json()).notes[0].body,text);
  assert.equal((await f.request(`/api/feedback/notes/${note.id}/delete`,{},bob)).status,200);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_notes').get().n,1);
  assert.equal((await f.request(`/api/admin/feedback/notes/${note.id}/delete`,{},bob)).status,403);
  const state=await (await f.request(`/api/admin/feedback?track=${id}&listener=${alice.user.id}`,undefined,admin)).json();
  assert.equal(state.notes[0].username,'alice');assert.equal(state.notes[0].body,text);assert.equal(state.notes[0].request_id,undefined);
  assert.equal((await (await f.request(`/api/admin/feedback?listener=${bob.user.id}`,undefined,admin)).json()).noteCount,0);
  f.db.prepare('UPDATE tracks SET visible=0 WHERE id=?').run(id);
  assert.equal((await (await f.request(path,undefined,alice)).json()).notes[0].body,text);
  assert.equal((await f.request(path+'/notes',{body:'Hidden',requestId:randomUUID()},alice)).status,404);
  assert.equal((await f.request(`/api/tracks/${id}/audio`,undefined,alice)).status,404);
  const auditCount=f.db.prepare('SELECT count(*) AS n FROM privacy_audit').get().n;
  assert.equal((await (await f.request('/api/feedback/history',undefined,alice)).json()).notes[0].body,text);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM privacy_audit').get().n,auditCount);
  const exported=await (await f.request('/api/feedback/export',undefined,alice)).json();assert.equal(exported.notes[0].body,text);
  assert.equal((await (await f.request('/api/feedback/export',undefined,bob)).json()).notes.length,0);
  await f.request('/api/admin/feedback/export',undefined,admin);assert.ok(f.db.prepare("SELECT id FROM privacy_audit WHERE actor_id=? AND action='feedback.admin.export'").get(admin.user.id));
  assert.equal((await f.request(`/api/admin/feedback/notes/${note.id}/delete`,{},admin)).status,200);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_notes').get().n,0);
  assert.ok(f.db.prepare("SELECT id FROM privacy_audit WHERE action='feedback.note.remove'").get());
  assert.equal((await f.request(path+'/notes',{body:'a note',requestId:randomUUID()},bob)).status,404);
});

test('pagination, write limits, own deletion, disabled-account retention and account deletion cascades',async t=>{
  const f=await fixture(t),alice=await f.login('alice'),bob=await f.login('bob'),admin=await f.login('artist'),id=f.tracks[0].id;
  for(let i=0;i<52;i++)f.db.prepare('INSERT INTO track_notes VALUES(?,?,?,?,?,?)').run(randomUUID(),alice.user.id,id,`Note ${i}`,Date.now(),randomUUID());
  const first=await (await f.request(`/api/feedback/tracks/${id}`,undefined,alice)).json(),second=await (await f.request(`/api/feedback/tracks/${id}?page=1`,undefined,alice)).json();
  assert.equal(first.notes.length,50);assert.equal(second.notes.length,2);assert.equal(second.nextPage,null);assert.equal(new Set([...first.notes,...second.notes].map(n=>n.id)).size,52);
  assert.equal((await f.request('/api/admin/feedback?page=-1',undefined,admin)).status,400);
  assert.equal((await f.request('/api/admin/feedback?listener=../../',undefined,admin)).status,400);
  f.db.prepare('INSERT INTO feedback_write_limits VALUES(?,?,?)').run(alice.user.id,Date.now(),20);
  assert.equal((await f.request(`/api/feedback/tracks/${id}/notes`,{body:'Limited',requestId:randomUUID()},alice)).status,429);
  f.db.prepare('UPDATE feedback_write_limits SET window_start=0 WHERE user_id=?').run(alice.user.id);
  await f.request(`/api/feedback/tracks/${id}/like`,{liked:true},alice);
  await f.request(`/api/feedback/tracks/${id}/notes`,{body:'Bob remains',requestId:randomUUID()},bob);
  f.db.prepare('UPDATE users SET disabled=1 WHERE id=?').run(alice.user.id);assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_notes WHERE user_id=?').get(alice.user.id).n,52);
  f.db.prepare('UPDATE users SET disabled=0 WHERE id=?').run(alice.user.id);
  await f.request('/api/feedback/delete',{},alice);assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_notes WHERE user_id=?').get(alice.user.id).n,0);assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_likes WHERE user_id=?').get(alice.user.id).n,0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_notes WHERE user_id=?').get(bob.user.id).n,1);
  f.db.prepare('DELETE FROM users WHERE id=?').run(bob.user.id);assert.equal(f.db.prepare('SELECT count(*) AS n FROM track_notes').get().n,0);
});

test('schema-3 migration failure rolls back and retries without changing schema-2 records',async t=>{
  const f=await fixture(t);
  // Rebuild just the new tables as a schema-2 fixture, retaining existing account/catalog data.
  f.db.exec('DROP TABLE track_notes;DROP TABLE track_likes;DROP TABLE feedback_write_limits;DROP TABLE privacy_audit;DELETE FROM schema_version WHERE version>=3;DROP INDEX track_classification;ALTER TABLE tracks DROP COLUMN release_status;ALTER TABLE tracks DROP COLUMN explicit_status;ALTER TABLE tracks DROP COLUMN content_type;ALTER TABLE tracks DROP COLUMN genres;ALTER TABLE tracks DROP COLUMN tags;ALTER TABLE collections DROP COLUMN kind;ALTER TABLE collections DROP COLUMN rules;CREATE TABLE track_notes(conflict TEXT)');
  const users=f.db.prepare('SELECT * FROM users').all(),tracks=f.db.prepare('SELECT * FROM tracks').all();
  assert.throws(()=>openDatabase(f.directory),/already exists/);
  const inspect=new DatabaseSync(join(f.directory,'artist.sqlite'));
  assert.equal(inspect.prepare('SELECT max(version) AS v FROM schema_version').get().v,2);
  assert.equal(inspect.prepare("SELECT name FROM sqlite_master WHERE name='track_likes'").get(),undefined);
  assert.deepEqual(inspect.prepare('SELECT * FROM users').all(),users);assert.deepEqual(inspect.prepare('SELECT * FROM tracks').all(),tracks);
  inspect.exec('DROP TABLE track_notes');inspect.close();
  const migrated=openDatabase(f.directory);assert.equal(migrated.prepare('SELECT max(version) AS v FROM schema_version').get().v,4);migrated.close();
});
