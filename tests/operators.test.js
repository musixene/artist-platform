import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDatabase } from '../apps/server/database.js';
import { loadConfig } from '../apps/server/config.js';
import { createApplication } from '../apps/server/app.js';
import { importTrack } from '../scripts/import-track.js';
test('operator tools are repeatable, preserve data, and reset sessions transactionally', () => {
  const directory = mkdtempSync(join(tmpdir(), 'musixene-operator-'));
  const env = { ...process.env, DATA_DIR: directory };
  let db;
  try {
    execFileSync(process.execPath, ['scripts/generate-demo.js'], { env });
    execFileSync(process.execPath, ['scripts/generate-demo.js'], { env });
    execFileSync(process.execPath, ['scripts/manage-user.js', 'operator-listener'], { env, input: 'a generated test passphrase' });
    db = openDatabase(directory);
    assert.equal(db.prepare('SELECT count(*) AS n FROM tracks').get().n, 3);
    const first = db.prepare('SELECT * FROM users').get();
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run('test-token-hash', first.id, 'test-csrf', Date.now() + 10000);
    db.close(); db = null;
    execFileSync(process.execPath, ['scripts/manage-user.js', 'operator-listener'], { env, input: 'another test-only passphrase' });
    db = openDatabase(directory);
    const changed = db.prepare('SELECT * FROM users').get();
    assert.equal(changed.id, first.id); assert.notEqual(changed.password_hash, first.password_hash);
    assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
    assert.equal(db.prepare('PRAGMA synchronous').get().synchronous, 2);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('branding accepts safe artist configuration and import rejects mismatched media', () => {
  const directory = mkdtempSync(join(tmpdir(), 'musixene-brand-'));
  try {
    const branding = join(directory, 'branding.json');
    writeFileSync(branding, JSON.stringify({ name: 'Test Artist', tagline: 'Independent', accent: 'url(evil)' }));
    const config = loadConfig({ DATA_DIR: directory, BRANDING_FILE: branding, APP_ORIGIN: 'https://artist.example' });
    assert.equal(config.branding.name, 'Test Artist'); assert.equal(config.branding.accent, '#b8ef70'); assert.equal(config.secureCookies, true);
    const source = join(directory, 'bad.wav'); writeFileSync(source, 'This is not an audio file.');
    assert.throws(() => importTrack({ source, title: 'Invalid', artist: 'Synthetic', dataDir: directory }), /signature/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('closed registration and HTTPS cookie policy are enforced', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'musixene-closed-'));
  const env = { ...process.env, DATA_DIR: directory };
  execFileSync(process.execPath, ['scripts/manage-user.js', 'invited'], { env, input: 'an isolated test passphrase' });
  const { server, db } = createApplication(loadConfig({ DATA_DIR: directory, APP_ORIGIN: 'https://artist.example', ALLOW_REGISTRATION: 'false' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const options = { method: 'POST', headers: { Origin: 'https://artist.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'invited', password: 'an isolated test passphrase' }) };
    assert.equal((await fetch(base + '/api/register', options)).status, 403);
    const response = await fetch(base + '/api/login', options);
    assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /; Secure/);
    assert.equal((await fetch(base + '/api/login', { ...options, headers: { 'Content-Type': 'application/json' } })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); }
});
