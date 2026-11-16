import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openDatabase } from '../apps/server/database.js';
import { createApplication } from '../apps/server/app.js';
import { loadConfig } from '../apps/server/config.js';
test('stopped-instance archive restores accounts, sessions, music, settings and ordered collections in isolation',async()=>{
  const root=mkdtempSync(join(tmpdir(),'artist-restore-')), source=join(root,'source'), restored=join(root,'restored'), archive=join(root,'data.tar.gz');
  let app;
  try {
    const env={...process.env,DATA_DIR:source};
    execFileSync(process.execPath,['scripts/generate-demo.js'],{env});
    execFileSync(process.execPath,['scripts/manage-user.js','restore-admin','administrator'],{env,input:'restore test passphrase'});
    const db=openDatabase(source),user=db.prepare('SELECT id FROM users').get();
    const tracks=db.prepare('SELECT id,filename FROM tracks ORDER BY created_at,id').all(), token='b'.repeat(64);
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),user.id,'restore-csrf',Date.now()+60000);
    db.prepare('INSERT INTO settings VALUES(?,?)').run('name',JSON.stringify('Restored Artist'));
    db.prepare('INSERT INTO collections VALUES(?,?,?,?)').run('restored-collection','Archive order',1,0);
    db.prepare('INSERT INTO collection_tracks VALUES(?,?,?)').run('restored-collection',tracks[1].id,0);
    db.prepare('INSERT INTO collection_tracks VALUES(?,?,?)').run('restored-collection',tracks[0].id,1);
    db.close(); // No active writer while archiving the entire directory, including any journals.
    execFileSync('tar',['-C',source,'-czf',archive,'.']);mkdirSync(restored,{mode:0o700});
    execFileSync('tar',['--no-same-owner','-xzf',archive,'-C',restored]);
    for(const track of tracks)assert.deepEqual(readFileSync(join(restored,'media',track.filename)),readFileSync(join(source,'media',track.filename)));
    const origin='http://localhost:3200';app=createApplication(loadConfig({DATA_DIR:restored,APP_ORIGIN:origin}));
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${app.server.address().port}`,headers={Cookie:`musixene_session=${token}`};
    assert.equal((await (await fetch(base+'/api/me',{headers})).json()).user.role,'administrator');
    assert.equal((await (await fetch(base+'/api/config')).json()).name,'Restored Artist');
    const collections=await (await fetch(base+'/api/collections',{headers})).json();assert.deepEqual(collections.collections[0].tracks.map(t=>t.id),[tracks[1].id,tracks[0].id]);
    assert.equal((await (await fetch(base+'/api/tracks',{headers})).json()).tracks.length,3);
    const range=await fetch(base+`/api/tracks/${tracks[0].id}/audio`,{headers:{...headers,Range:'bytes=44-99'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),readFileSync(join(source,'media',tracks[0].filename)).subarray(44,100));
    const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'restore-admin',password:'restore test passphrase'})});assert.equal(login.status,200);
  } finally {if(app){await new Promise(resolve=>app.server.close(resolve));app.db.close();}rmSync(root,{recursive:true,force:true});}
});
