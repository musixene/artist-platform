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
server.listen(3100, '127.0.0.1');
function close() { server.close(() => { db.close(); rmSync(directory, { recursive: true, force: true }); process.exit(0); }); }
process.on('SIGTERM', close); process.on('SIGINT', close);
