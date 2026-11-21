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
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID, scryptSync } from 'node:crypto';
import { createApplication } from '../apps/server/app.js';
import { loadConfig } from '../apps/server/config.js';
export async function fixture(t, env = {}) {
  const directory=mkdtempSync(join(tmpdir(),'artist-feedback-'));
  execFileSync(process.execPath,['scripts/generate-demo.js'],{env:{...process.env,DATA_DIR:directory}});
  const origin='http://localhost:3000',app=createApplication(loadConfig({DATA_DIR:directory,APP_ORIGIN:origin,ALLOW_REGISTRATION:'true',...env}));
  const password='synthetic feedback passphrase',salt='synthetic-salt',derived=scryptSync(password,salt,64).toString('hex');
  for(const [name,role] of [['artist','administrator'],['alice','listener'],['bob','listener']])app.db.prepare('INSERT INTO users(id,username,salt,password_hash,created_at,role) VALUES(?,?,?,?,?,?)').run(randomUUID(),name,salt,derived,Date.now(),role);
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.db.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const request=(path,data,auth,headers={})=>fetch(base+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
  async function login(username){const response=await request('/api/login',{username,password});if(!response.ok)throw new Error('Fixture login failed');return {...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};}
  return {...app,directory,request,login,tracks:app.db.prepare('SELECT * FROM tracks ORDER BY created_at,id').all()};
}
