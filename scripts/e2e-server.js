import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../apps/server/config.js';
import { createApplication } from '../apps/server/app.js';
const directory = mkdtempSync(join(tmpdir(), 'musixene-browser-'));
execFileSync(process.execPath, ['scripts/generate-demo.js'], { env: { ...process.env, DATA_DIR: directory } });
const { server, db } = createApplication(loadConfig({ DATA_DIR: directory, APP_ORIGIN: 'http://localhost:3100' }));
server.listen(3100, '127.0.0.1');
function close() { server.close(() => { db.close(); rmSync(directory, { recursive: true, force: true }); process.exit(0); }); }
process.on('SIGTERM', close); process.on('SIGINT', close);
