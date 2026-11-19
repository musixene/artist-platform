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
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../apps/server/config.js';
import { createApplication } from '../apps/server/app.js';
const directory = mkdtempSync(join(tmpdir(), 'musixene-browser-'));
execFileSync(process.execPath, ['scripts/generate-demo.js'], { env: { ...process.env, DATA_DIR: directory } });
execFileSync(process.execPath, ['scripts/manage-user.js','browser-admin','administrator'], { env: { ...process.env, DATA_DIR: directory }, input: 'synthetic admin passphrase' });
const { server, db } = createApplication(loadConfig({ DATA_DIR: directory, APP_ORIGIN: 'http://localhost:3100', ALLOW_REGISTRATION: 'true' }));
// Synthetic UI classifications only; these tones are not actual artist recordings.
const demo=db.prepare('SELECT id FROM tracks ORDER BY created_at,id').all();
for(const [i,track] of demo.entries())db.prepare('UPDATE tracks SET release_status=?,explicit_status=?,content_type=?,genres=?,tags=? WHERE id=?').run(i===1?'unpublished':'published',i===0?'explicit':i===1?'non_explicit':'unreviewed',i===2?'interview':'music',JSON.stringify(i===0?['Soul','Funk']:i===1?['Jazz']:[]),JSON.stringify(i===0?['Driving']:[]),track.id);
db.prepare('INSERT INTO collections(id,title,visible,position) VALUES(?,?,?,?)').run('synthetic-pair','Synthetic Pair',1,0);
db.prepare('INSERT INTO collection_tracks VALUES(?,?,?)').run('synthetic-pair',demo[1].id,0);
db.prepare('INSERT INTO collection_tracks VALUES(?,?,?)').run('synthetic-pair',demo[0].id,1);
db.prepare('INSERT INTO collections(id,title,visible,position,kind,rules) VALUES(?,?,?,?,?,?)').run('synthetic-nonexplicit','Synthetic Non-Explicit',1,1,'dynamic',JSON.stringify({explicit_status:'non_explicit'}));
server.listen(3100, '127.0.0.1');
function close() { server.close(() => { db.close(); rmSync(directory, { recursive: true, force: true }); process.exit(0); }); }
process.on('SIGTERM', close); process.on('SIGINT', close);
