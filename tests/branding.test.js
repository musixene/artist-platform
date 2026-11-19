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
import { readdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './fixture.js';
import { png } from './png.js';

test('branding validates bounded PNGs/dimensions, roles and CSRF, updates public assets/manifest and retains old files',async t=>{
  const f=await fixture(t),admin=await f.login('artist'),listener=await f.login('alice'),base=`http://127.0.0.1:${f.server.address().port}`;
  const upload=(kind,data,{auth=admin,mime='image/png',csrf=auth?.csrf}={})=>fetch(base+`/api/admin/branding/${kind}`,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':mime,...(auth?{Cookie:auth.cookie,'X-CSRF-Token':csrf}:{})},body:data});
  assert.equal((await upload('logo',png(128,64),{auth:listener})).status,403);
  assert.equal((await upload('logo',png(128,64),{csrf:'wrong'})).status,403);
  assert.equal((await upload('logo',png(128,64),{auth:null})).status,401);
  assert.equal((await upload('logo',Buffer.from('<svg></svg>'),{mime:'image/svg+xml'})).status,415);
  for(const [kind,data]of [['logo',Buffer.from('89504e470d0a1a0a00000000','hex')],['logo',png(20,20)],['favicon',png(64,32)],['icon512',png(192,192)],['icon192',png(512,512)],['logo',png(128,64,{pixels:Buffer.alloc(20)})],['logo',png(128,64,{pixels:Buffer.alloc(1024*1024)})]])assert.equal((await upload(kind,data)).status,400);
  assert.equal((await upload('logo',Buffer.alloc(2*1024*1024+1))).status,413);
  const corrupt=png(128,64);corrupt[corrupt.length-1]^=1;assert.equal((await upload('logo',corrupt)).status,400);
  assert.equal(readdirSync(join(f.directory,'branding')).length,0);
  const settings={name:'Independent Test Artist',wordmark:'The Test Room',tagline:'',pwaName:'Test Artist Player',pwaShortName:'Test Room',accent:'#354675',registration:false};
  assert.equal((await f.request('/api/admin/settings',settings,admin)).status,200);
  const logo=png(128,64);assert.equal((await upload('logo',logo)).status,200);const old=JSON.parse(f.db.prepare("SELECT value FROM settings WHERE key='logo'").get().value);
  let config=await(await f.request('/api/config')).json();assert.equal(config.tagline,'');assert.match(config.assets.logo,/^\/branding\/logo\?v=/);const served=await fetch(base+config.assets.logo);assert.equal(served.headers.get('cache-control'),'no-store');assert.equal(served.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await served.arrayBuffer()),logo);
  assert.equal((await upload('icon512',png(512,512))).status,200);let manifest=await(await f.request('/manifest.webmanifest')).json();assert.equal(manifest.name,settings.pwaName);assert.equal(manifest.short_name,settings.pwaShortName);assert.equal(manifest.theme_color,settings.accent);assert.deepEqual(manifest.icons.map(i=>i.sizes),['512x512']);
  assert.equal((await upload('icon192',png(192,192))).status,200);manifest=await(await f.request('/manifest.webmanifest')).json();assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
  assert.equal((await upload('favicon',png(64,64))).status,200);assert.equal((await fetch(base+'/branding/favicon')).headers.get('content-type'),'image/png');
  await upload('logo',png(128,64,{color:[220,100,80,255]}));assert.ok(existsSync(join(f.directory,'branding',old)));assert.deepEqual(readFileSync(join(f.directory,'branding',old)),logo);
  assert.equal((await f.request('/api/admin/branding/logo/clear',{},admin)).status,200);config=await(await f.request('/api/config')).json();assert.equal(config.assets.logo,null);assert.ok(existsSync(join(f.directory,'branding',old)));
  const filename=JSON.parse(f.db.prepare("SELECT value FROM settings WHERE key='icon512'").get().value);unlinkSync(join(f.directory,'branding',filename));const fallback=await fetch(base+'/branding/icon512');assert.equal(fallback.status,200);assert.equal(fallback.headers.get('content-type'),'image/png');manifest=await(await f.request('/manifest.webmanifest')).json();assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192']);
  await f.request('/api/admin/branding/favicon/clear',{},admin);assert.equal((await fetch(base+'/branding/favicon')).headers.get('content-type'),'image/svg+xml');
  assert.equal((await fetch(base+'/branding/../../artist.sqlite')).status,404);
});
