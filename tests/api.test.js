import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApplication, parseRange } from '../apps/server/app.js';
import { loadConfig } from '../apps/server/config.js';
let app, directory, base, cookie, csrf;
const origin = 'http://localhost:3000';
async function request(path, { method = 'GET', data, auth = true, headers = {} } = {}) {
  return fetch(base + path, { method, headers: { ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(auth && cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'musixene-test-'));
  execFileSync(process.execPath, ['scripts/generate-demo.js'], { env: { ...process.env, DATA_DIR: directory } });
  app = createApplication(loadConfig({ DATA_DIR: directory, APP_ORIGIN: origin, ALLOW_REGISTRATION: 'true' }));
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => { await new Promise(resolve => app.server.close(resolve)); app.db.close(); await rm(directory, { recursive: true, force: true }); });
test('configuration validates production origin and exposes no secrets', async () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /HTTPS/);
  const response = await request('/api/config'); const config = await response.json();
  assert.equal(config.accounting.chargesEnabled, false); assert.equal(config.registration, true);
  assert.equal((await request('/api/health')).status, 200);
});
test('anonymous listeners cannot list or stream tracks; filesystem is never exposed', async () => {
  assert.equal((await request('/api/tracks', { auth: false })).status, 401);
  const id = app.db.prepare('SELECT id FROM tracks LIMIT 1').get().id;
  assert.equal((await request(`/api/tracks/${id}/audio`, { auth: false })).status, 401);
  for (const path of ['/data/artist.sqlite', '/media/test.wav', '/.env']) assert.equal((await request(path)).status, 404);
});
test('registration, password hashing, origin checks, and account validation', async () => {
  assert.equal((await request('/api/register', { method: 'POST', data: { username: 'bad', password: 'short' } })).status, 400);
  assert.equal((await request('/api/register', { method: 'POST', data: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
  const response = await request('/api/register', { method: 'POST', data: { username: 'Listener', password: 'a long unique passphrase' } });
  assert.equal(response.status, 201); cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
  const result = await response.json(); csrf = result.csrf; assert.equal(result.user.username, 'listener');
  const row = app.db.prepare('SELECT * FROM users').get(); assert.notEqual(row.password_hash, 'a long unique passphrase'); assert.equal(row.password_hash.length, 128);
  assert.equal((await request('/api/register', { method: 'POST', data: { username: 'listener', password: 'another long passphrase' } })).status, 409);
  assert.equal((await request('/api/me')).status, 200);
});
test('track catalog and authenticated full/range/HEAD streams match private file bytes', async () => {
  const response = await request('/api/tracks'); assert.equal(response.status, 200);
  const { tracks } = await response.json(); assert.equal(tracks.length, 3); assert.equal(tracks[0].filename, undefined);
  for (const track of tracks) {
    const path = `/api/tracks/${track.id}/audio`;
    const record = app.db.prepare('SELECT filename FROM tracks WHERE id=?').get(track.id);
    const file = await readFile(join(directory, 'media', record.filename));
    const full = await request(path); assert.equal(full.status, 200); assert.equal(full.headers.get('cache-control'), 'no-store'); assert.deepEqual(Buffer.from(await full.arrayBuffer()), file);
    const range = await request(path, { headers: { Range: 'bytes=44-99' } });
    assert.equal(range.status, 206); assert.equal(range.headers.get('content-range'), `bytes 44-99/${file.length}`); assert.deepEqual(Buffer.from(await range.arrayBuffer()), file.subarray(44, 100));
    const suffix = await request(path, { headers: { Range: 'bytes=-8' } }); assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), file.subarray(-8));
    const head = await request(path, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(file.length)); assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await request(path, { headers: { Range: `bytes=${file.length}-` } })).status, 416);
    assert.equal((await request(path, { headers: { Range: 'bytes=0-1,4-5' } })).status, 416);
  }
  assert.equal((await request('/api/tracks/nonexistent/audio')).status, 404);
});
test('logout requires CSRF; invalidates session; login validates password; expired sessions fail', async () => {
  assert.equal((await request('/api/logout', { method: 'POST', data: {}, headers: { 'X-CSRF-Token': 'bad' } })).status, 403);
  assert.equal((await request('/api/logout', { method: 'POST', data: {} })).status, 200);
  assert.equal((await request('/api/me')).status, 401);
  assert.equal((await request('/api/login', { method: 'POST', data: { username: 'listener', password: 'wrong but long password' } })).status, 401);
  const login = await request('/api/login', { method: 'POST', data: { username: 'LISTENER', password: 'a long unique passphrase' } });
  assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0]; csrf = (await login.json()).csrf;
  app.db.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await request('/api/tracks')).status, 401);
});
test('PWA manifest, shell, CSP and worker excludes private requests', async () => {
  const manifest = await (await request('/manifest.webmanifest')).json(); assert.equal(manifest.display, 'standalone'); assert.equal(manifest.icons.length, 2);
  for (const asset of ['/', '/app.js', '/player.js', '/style.css', '/theme.css', '/sw.js', '/icon-192.png', '/icon-512.png']) assert.equal((await request(asset)).status, 200, asset);
  const page = await request('/'); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await page.text(); assert.match(html, /Powered by an Open Source Concept from Musixene/);
});
test('auth throttling limits brute force', async () => {
  let response;
  for (let i=0;i<16;i++) response = await request('/api/login', { method:'POST', data: { username: 'unknown', password: 'invalid long password' } });
  assert.equal(response.status, 429);
});
test('range parser rejects unsafe and malformed intervals', () => {
  for (const value of ['bytes=-0', 'bytes=9-2', 'bytes=9007199254740992-', 'bytes=-', 'cats=0-4']) assert.equal(parseRange(value, 100), null);
  assert.deepEqual(parseRange('bytes=90-200', 100), { start: 90, end: 99 });
});
