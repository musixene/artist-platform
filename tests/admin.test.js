import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../apps/server/database.js';
import { loadConfig } from '../apps/server/config.js';
import { createApplication } from '../apps/server/app.js';
const origin='http://localhost:3000', password='synthetic test passphrase';
async function fixture(t) {
  const directory=mkdtempSync(join(tmpdir(),'artist-admin-'));
  execFileSync(process.execPath,['scripts/manage-user.js','artist-admin','administrator'],{env:{...process.env,DATA_DIR:directory},input:password});
  const app=createApplication(loadConfig({DATA_DIR:directory,APP_ORIGIN:origin}));
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.db.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,data,auth,headers={},raw) {
    return fetch(base+path,{method:data!==undefined || raw!==undefined?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{}),...headers},body:raw ?? (data===undefined?undefined:JSON.stringify(data))});
  }
  async function login(username='artist-admin') {const res=await request('/api/login',{username,password});assert.equal(res.status,200);const data=await res.json();return {...data,cookie:res.headers.get('set-cookie').split(';')[0]};}
  return {...app,directory,request,login};
}
test('version-1 migration preserves accounts, sessions, catalog and audio bytes, and is repeatable',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'artist-migration-'));
  try {
    const filename=join(directory,'artist.sqlite');let db=new DatabaseSync(filename);
    // Use the actual previous schema, not the current migration code.
    db.exec(`CREATE TABLE schema_version(version INTEGER PRIMARY KEY); INSERT INTO schema_version VALUES(1);
      CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE tracks(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist TEXT NOT NULL,filename TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,created_at INTEGER NOT NULL);
      INSERT INTO users VALUES('legacy-user','legacy','salt','hash',123);
      INSERT INTO sessions VALUES('token','legacy-user','csrf',9999999999999);
      INSERT INTO tracks VALUES('legacy-track','Legacy title','Artist','original.mp3','audio/mpeg',456);`);
    db.prepare('UPDATE users SET password_hash=?').run(scryptSync(password,'salt',64).toString('hex'));
    const legacyToken='a'.repeat(64);
    db.prepare('UPDATE sessions SET token_hash=?').run(createHash('sha256').update(legacyToken).digest('hex'));
    const oldUser=db.prepare('SELECT * FROM users').get(), oldSession=db.prepare('SELECT * FROM sessions').get(), oldTrack=db.prepare('SELECT * FROM tracks').get();db.close();
    mkdirSync(join(directory,'media'));const audio=Buffer.from('ID3 synthetic legacy bytes');writeFileSync(join(directory,'media','original.mp3'),audio);
    for(let i=0;i<2;i++) {
      db=openDatabase(directory);
      assert.equal(db.prepare('SELECT max(version) AS v FROM schema_version').get().v,2);
      const user=db.prepare('SELECT * FROM users').get();assert.deepEqual({...user,role:undefined,disabled:undefined},{...oldUser,role:undefined,disabled:undefined});assert.equal(user.role,'listener');assert.equal(user.disabled,0);
      assert.deepEqual(db.prepare('SELECT * FROM sessions').get(),oldSession);
      const track=db.prepare('SELECT * FROM tracks').get();for(const [key,value] of Object.entries(oldTrack))assert.equal(track[key],value);assert.equal(track.visible,1);
      db.close();assert.deepEqual(readFileSync(join(directory,'media','original.mp3')),audio);
    }
    const app=createApplication(loadConfig({DATA_DIR:directory,APP_ORIGIN:origin}));
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    try {
      const base=`http://127.0.0.1:${app.server.address().port}`;
      const headers={Cookie:`musixene_session=${legacyToken}`};
      assert.equal((await fetch(base+'/api/me',{headers})).status,200);
      const range=await fetch(base+'/api/tracks/legacy-track/audio',{headers:{...headers,Range:'bytes=0-9'}});
      assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),audio.subarray(0,10));
      const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'legacy',password})});
      assert.equal(login.status,200);assert.equal((await login.json()).user.role,'listener');
    } finally {await new Promise(resolve=>app.server.close(resolve));app.db.close();}
    db=openDatabase(directory);db.prepare('INSERT INTO schema_version VALUES(99)').run();db.close();assert.throws(()=>openDatabase(directory),/newer/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
test('invite-only default, atomic single use, expiry, binding, rollback and listener role isolation',async t=>{
  const {request,login,db}=await fixture(t),admin=await login();
  assert.equal((await (await request('/api/config')).json()).registration,false);
  assert.equal((await request('/api/register',{username:'public-user',password})).status,403);
  assert.equal((await request('/api/admin/state')).status,401);
  assert.equal((await request('/api/admin/invitations',{hours:72},admin,{'X-CSRF-Token':'wrong'})).status,403);
  async function invite(username){const res=await request('/api/admin/invitations',{hours:1,username},admin);assert.equal(res.status,201);return res.json();}
  const token=await invite('invited-user');
  assert.equal((await request('/api/register',{username:'wrong-user',password,invitation:token.token})).status,403);
  const results=await Promise.all([1,2].map(()=>request('/api/register',{username:'invited-user',password,invitation:token.token,role:'administrator'})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,403]);
  const result=await results.find(r=>r.status===201).json();assert.equal(result.user.role,'listener');
  const listener=await login('invited-user');assert.equal((await request('/api/admin/state',undefined,listener)).status,403);
  assert.equal((await request('/api/admin/settings',{name:'evil'},listener)).status,403);
  const expired=await invite();db.prepare('UPDATE invitations SET expires_at=0 WHERE id=?').run(expired.id);
  assert.equal((await request('/api/register',{username:'expired-user',password,invitation:expired.token})).status,403);
  const revoked=await invite();assert.equal((await request(`/api/admin/invitations/${revoked.id}/revoke`,{},admin)).status,200);
  assert.equal((await request('/api/register',{username:'revoked-user',password,invitation:revoked.token})).status,403);
  const collision=await invite();assert.equal((await request('/api/register',{username:'invited-user',password,invitation:collision.token})).status,409);
  assert.equal(db.prepare('SELECT used_at FROM invitations WHERE id=?').get(collision.id).used_at,null);
  const saved=db.prepare('SELECT * FROM invitations WHERE id=?').get(token.id);assert.notEqual(saved.token_hash,token.token);assert.equal(saved.token_hash.length,64);
  const state=await (await request('/api/admin/state',undefined,admin)).json();assert.equal(JSON.stringify(state).includes(token.token),false);assert.equal(state.users[0].password_hash,undefined);
});
test('administrator settings persist, listeners can be disabled/reset, last admin remains protected',async t=>{
  const {request,login,db,directory}=await fixture(t);let admin=await login();const id=admin.user.id;
  assert.equal((await request(`/api/admin/users/${id}`,{role:'listener',disabled:false},admin)).status,409);
  assert.equal((await request(`/api/admin/users/${id}`,{role:'administrator',disabled:true},admin)).status,409);
  assert.equal((await request('/api/admin/settings',null,admin)).status,400);
  assert.equal((await request('/api/admin/settings',[],admin)).status,400);
  const settings={name:'My Artist',tagline:'My music',accent:'#123abc',registration:true};
  assert.equal((await request('/api/admin/settings',{...settings,accent:'url(evil)'},admin)).status,400);
  assert.equal((await request('/api/admin/settings',settings,admin)).status,200);
  assert.equal((await (await request('/api/config')).json()).name,settings.name);
  const reopened=openDatabase(directory);assert.equal(JSON.parse(reopened.prepare("SELECT value FROM settings WHERE key='registration'").get().value),true);reopened.close();
  assert.match(await (await request('/theme.css')).text(),/#123abc/);
  assert.equal((await (await request('/manifest.webmanifest')).json()).name,settings.name);
  assert.equal((await request('/api/register',{username:'managed-user',password})).status,201);let listener=await login('managed-user');
  assert.equal((await request(`/api/admin/users/${listener.user.id}`,{role:'listener',disabled:true},admin)).status,200);
  assert.equal((await request('/api/me',undefined,listener)).status,401);
  assert.equal((await request('/api/login',{username:'managed-user',password})).status,401);
  assert.equal((await request(`/api/admin/users/${listener.user.id}`,{role:'administrator',disabled:false,password:'replacement test password'},admin)).status,200);
  assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(listener.user.id).role,'administrator');
  assert.equal((await request('/api/login',{username:'managed-user',password})).status,401);
  const newLogin=await request('/api/login',{username:'managed-user',password:'replacement test password'});assert.equal(newLogin.status,200);
  assert.equal((await request(`/api/admin/users/${id}`,{role:'listener',disabled:false},admin)).status,200);
  assert.equal((await request('/api/admin/state',undefined,admin)).status,401);
  admin=await login();assert.equal(admin.user.role,'listener');assert.equal((await request('/api/admin/state',undefined,admin)).status,403);
});
test('private bounded uploads, track ordering/visibility/artwork and transactional collections',async t=>{
  const {request,login,db,directory}=await fixture(t),admin=await login();
  const draft=await (await request('/api/admin/tracks',{title:'Draft',artist:'Artist'},admin)).json();
  assert.equal((await request(`/api/admin/tracks/${draft.id}`,{title:'Draft',artist:'Artist',visible:true,position:0},admin)).status,409);
  const wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);
  const audioPath=`/api/admin/tracks/${draft.id}/audio`;
  assert.equal((await request(audioPath,undefined,admin,{'Content-Type':'audio/wav'},Buffer.from('invalid audio header'))).status,400);
  assert.equal(readdirSync(join(directory,'media')).length,0);
  assert.equal((await request(audioPath,undefined,admin,{'Content-Type':'text/html'},wav)).status,415);
  assert.equal((await request(audioPath,undefined,admin,{'Content-Type':'audio/wav'},wav)).status,200);
  const original=db.prepare('SELECT filename FROM tracks WHERE id=?').get(draft.id).filename;assert.match(original,/^[a-f0-9-]+\.wav$/);assert.deepEqual(readFileSync(join(directory,'media',original)),wav);
  assert.equal((await request(audioPath,undefined,admin,{'Content-Type':'audio/wav'},wav)).status,200);assert.deepEqual(readFileSync(join(directory,'media',original)),wav);
  const png=Buffer.from('89504e470d0a1a0a00000000','hex');
  assert.equal((await request(`/api/admin/tracks/${draft.id}/artwork`,undefined,admin,{'Content-Type':'image/png'},Buffer.alloc(5*1024*1024+1))).status,413);
  assert.equal((await request(`/api/admin/tracks/${draft.id}/artwork`,undefined,admin,{'Content-Type':'image/svg+xml'},Buffer.from('<svg></svg>'))).status,415);
  assert.equal((await request(`/api/admin/tracks/${draft.id}/artwork`,undefined,admin,{'Content-Type':'image/png'},png)).status,200);
  await request('/api/admin/settings',{name:'Artist',tagline:'Music',accent:'#123456',registration:true},admin);
  await request('/api/register',{username:'listener',password});const listener=await login('listener');
  assert.equal((await request(audioPath,undefined,listener,{'Content-Type':'audio/wav'},wav)).status,403);
  assert.equal((await request(`/api/tracks/${draft.id}/audio`,undefined,listener)).status,404);
  assert.equal((await request(`/api/tracks/${draft.id}/artwork`,undefined,listener)).status,404);
  const publish={title:'Published',artist:'Artist',visible:true,position:3};
  assert.equal((await request(`/api/admin/tracks/${draft.id}`,publish,admin)).status,200);
  assert.equal((await request(`/api/tracks/${draft.id}/audio`,undefined,listener)).status,200);
  assert.deepEqual(Buffer.from(await (await request(`/api/tracks/${draft.id}/artwork`,undefined,listener)).arrayBuffer()),png);
  const second=await (await request('/api/admin/tracks',{title:'Second',artist:'Artist'},admin)).json();
  await request(`/api/admin/tracks/${second.id}/audio`,undefined,admin,{'Content-Type':'audio/wav'},wav);
  await request(`/api/admin/tracks/${second.id}`,{...publish,title:'Second',position:1},admin);
  assert.deepEqual((await (await request('/api/tracks',undefined,listener)).json()).tracks.map(t=>t.id),[second.id,draft.id]);
  const collection={title:'Collection',visible:true,position:0,trackIds:[draft.id,second.id]};
  const saved=await (await request('/api/admin/collections',collection,admin)).json();
  assert.deepEqual((await (await request('/api/collections',undefined,listener)).json()).collections[0].tracks.map(t=>t.id),collection.trackIds);
  assert.equal((await request('/api/admin/collections',{...collection,id:saved.id,trackIds:[second.id,second.id]},admin)).status,400);
  assert.equal((await request('/api/admin/collections',{...collection,id:saved.id,trackIds:['missing']},admin)).status,400);
  assert.equal(db.prepare('SELECT count(*) AS n FROM collection_tracks').get().n,2);
  await request(`/api/admin/tracks/${draft.id}`,{...publish,visible:false},admin);
  assert.equal((await request(`/api/tracks/${draft.id}/audio`,undefined,listener)).status,404);
  assert.deepEqual((await (await request('/api/collections',undefined,listener)).json()).collections[0].tracks.map(t=>t.id),[second.id]);
  await request('/api/admin/collections',{...collection,id:saved.id,visible:false},admin);
  assert.equal((await (await request('/api/collections',undefined,listener)).json()).collections.length,0);
  await request(`/api/admin/collections/${saved.id}/delete`,{},admin);assert.equal(db.prepare('SELECT count(*) AS n FROM collection_tracks').get().n,0);
});

test('failed migration rolls back all new columns and the version marker',()=>{
  const directory=mkdtempSync(join(tmpdir(),'artist-migration-failure-'));
  try {
    let db=new DatabaseSync(join(directory,'artist.sqlite'));
    db.exec(`CREATE TABLE schema_version(version INTEGER PRIMARY KEY);INSERT INTO schema_version VALUES(1);
      CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE tracks(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist TEXT NOT NULL,filename TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT INTO users VALUES('preserve','listener','salt','hash',123);`);
    db.close();assert.throws(()=>openDatabase(directory),/already exists/);
    db=new DatabaseSync(join(directory,'artist.sqlite'));
    assert.equal(db.prepare('SELECT max(version) AS v FROM schema_version').get().v,1);
    assert.equal(db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='role'),false);
    assert.equal(db.prepare('PRAGMA table_info(tracks)').all().some(c=>c.name==='visible'),false);
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,1);
    db.exec('DROP TABLE settings');db.close();db=openDatabase(directory);assert.equal(db.prepare('SELECT role FROM users').get().role,'listener');db.close();
  } finally {rmSync(directory,{recursive:true,force:true});}
});
