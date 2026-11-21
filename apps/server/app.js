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
import packageInfo from '../../package.json' with { type: 'json' };
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { openDatabase } from './database.js';
import { catalog, listenerTracks, listenerCollections } from './catalog.js';
import { brandingAsset, brandingURL } from './branding.js';
import { diagnosticService, pruneDiagnostics } from './diagnostics.js';
import { feedback } from './feedback.js';
import { administer, settings } from './admin.js';
import { NoChargeAccounting } from '../../packages/domain/accounting.js';
const scrypt = promisify(scryptCallback);
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../web');
const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/admin': ['admin.html', 'text/html; charset=utf-8'],
  '/feedback-ui.js': ['feedback-ui.js', 'text/javascript; charset=utf-8'],
  '/admin.js': ['admin.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/diagnostics.js': ['diagnostics.js', 'text/javascript; charset=utf-8'],
  '/diagnostic-format.js': ['diagnostic-format.js', 'text/javascript; charset=utf-8'],
  '/diagnostics-ui.js': ['diagnostics-ui.js', 'text/javascript; charset=utf-8'],
  '/player.js': ['player.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png']
};
const hash = value => createHash('sha256').update(value).digest('hex');
const sessionLifetime = 30 * 86400_000;
const genericLogin = 'Invalid username or password';
function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(data));
}
function fail(status, message) { return Object.assign(new Error(message), { status }); }
async function body(req, limit = 8192) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'Use application/json');
  let bytes = 0; const parts = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw fail(413, 'Request too large');
    parts.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(parts).toString()); } catch { throw fail(400, 'Invalid JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, 'JSON object required');
  return data;
}
export function parseRange(value, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(value || '');
  if (!m || (!m[1] && !m[2])) return null;
  let start, end;
  if (!m[1]) {
    const count = Number(m[2]);
    if (!Number.isSafeInteger(count) || count <= 0) return null;
    start = Math.max(0, size - count); end = size - 1;
  } else {
    start = Number(m[1]); end = m[2] ? Number(m[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return start < size && end >= start ? { start, end } : null;
}
export function createApplication(config, { accounting = new NoChargeAccounting() } = {}) {
  const db = openDatabase(config.dataDir);
  const diagnostics = diagnosticService(db, config, packageInfo.version);
  const attempts = new Map();
  const dummySalt = randomBytes(16).toString('hex');
  const dummyHash = randomBytes(64);
  let pendingPasswordWork = 0;
  function limited(req) {
    // Do not trust forwarded IP headers. Reverse proxies should also rate-limit auth.
    const key = req.socket.remoteAddress || 'unknown'; const now = Date.now();
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    const item = attempts.get(key) || { count: 0, until: now + 60_000 };
    if (item.count >= 15 || pendingPasswordWork >= 8 || (!attempts.has(key) && attempts.size >= 10000)) throw fail(429, 'Too many attempts; try again shortly');
    item.count++; attempts.set(key, item);
  }
  function session(req) {
    const token = /(?:^|;\s*)musixene_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!token) return null;
    return db.prepare('SELECT users.id, users.username, users.role, sessions.csrf, sessions.token_hash AS sessionHash FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>? AND users.disabled=0').get(hash(token), Date.now());
  }
  function issueSession(res, user) {
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(hash(token), user.id, csrf, Date.now() + sessionLifetime);
    res.setHeader('Set-Cookie', `musixene_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetime / 1000}${config.secureCookies ? '; Secure' : ''}`);
    return csrf;
  }
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const currentSettings = settings(db, config);
    const url = new URL(req.url, config.origin), path = url.pathname;
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, POST'); throw fail(405, 'Method not allowed'); }
    if (req.method === 'POST' && req.headers.origin !== config.origin) throw fail(403, 'Origin rejected');
    if (path === '/api/health' && req.method === 'GET') return json(res, 200, { status: 'ok', version:packageInfo.version, schema: db.prepare('SELECT max(version) AS version FROM schema_version').get().version });
    if (path === '/api/config' && req.method === 'GET') return json(res, 200, { ...currentSettings, assets:Object.fromEntries(['logo','favicon','icon192','icon512'].map(kind=>[kind,brandingURL(kind,currentSettings[kind])])), accounting: { mode: 'disabled', chargesEnabled: false } });
    const branding=/^\/branding\/(logo|favicon|icon192|icon512)$/.exec(path);
    if(branding && ['GET','HEAD'].includes(req.method)){
      const kind=branding[1];let data=await brandingAsset(config.dataDir,currentSettings[kind]);
      if(!data){
        if(kind==='logo'){res.writeHead(404);return res.end();}
        const fallback=kind==='icon512'?'icon-512.png':kind==='icon192'?'icon-192.png':'icon.svg';
        data=await readFile(join(webRoot,fallback));
        res.writeHead(200,{'Content-Type':fallback.endsWith('.svg')?'image/svg+xml':'image/png','Content-Length':data.length});
      }else res.writeHead(200,{'Content-Type':'image/png','Content-Length':data.length});
      return res.end(req.method==='HEAD'?undefined:data);
    }
    if (path === '/theme.css'  && ['GET', 'HEAD'].includes(req.method)) {
      const rgb=currentSettings.accent.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      const css = `:root{--accent:${currentSettings.accent};--on-accent:${luminance>.179?'#000000':'#ffffff'};--accent-ink:${luminance>.179?currentSettings.accent:'#d3ddec'}}`;
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return res.end(req.method === 'HEAD' ? undefined : css);
    }
    if (path === '/manifest.webmanifest' && ['GET', 'HEAD'].includes(req.method)) {
      const custom512=await brandingAsset(config.dataDir,currentSettings.icon512),custom192=await brandingAsset(config.dataDir,currentSettings.icon192);
      const icons=[];
      if(custom192)icons.push({src:brandingURL('icon192',currentSettings.icon192),sizes:'192x192',type:'image/png',purpose:'any'});
      if(custom512)icons.push({src:brandingURL('icon512',currentSettings.icon512),sizes:'512x512',type:'image/png',purpose:'any'});
      if(!icons.length)for(const size of [192,512])icons.push({src:`/branding/icon${size}`,sizes:`${size}x${size}`,type:'image/png',purpose:'any'});
      const manifest = { id: '/', name: currentSettings.pwaName||currentSettings.name, short_name: currentSettings.pwaShortName||currentSettings.name.slice(0,24), start_url: '/', scope: '/', display: 'standalone', background_color: '#101512', theme_color: currentSettings.accent, icons };
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' }); return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(manifest));
    }
    if (['/api/register', '/api/login'].includes(path) && req.method === 'POST') {
      limited(req);
      const data = await body(req);
      const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
      const password = data.password;
      if (!/^[a-z0-9_.-]{3,40}$/.test(username) || typeof password !== 'string' || password.length < 12 || password.length > 128) throw fail(400, 'Use a 3–40 character username (letters, numbers, . _ -) and a 12–128 character password');
      const invite = typeof data.invitation === 'string' && /^[a-f0-9]{64}$/.test(data.invitation) ? hash(data.invitation) : '';
      const validInvitation = () => db.prepare('SELECT id FROM invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND (username IS NULL OR username=?)').get(invite,Date.now(),username);
      if (path === '/api/register' && (data.invitation || !currentSettings.registration) && !validInvitation()) throw fail(403, 'A valid invitation is required');
      // Recheck after reading the body: concurrent slow requests must not bypass the work cap.
      if (pendingPasswordWork >= 8) throw fail(429, 'Too many attempts; try again shortly');
      pendingPasswordWork++;
      let user;
      try {
        if (path === '/api/register') {
          const salt = randomBytes(16).toString('hex');
          const derived = await scrypt(password, salt, 64);
          user = { id: randomUUID(), username, role: 'listener' };
          db.exec('BEGIN IMMEDIATE');
          try {
            // Validate again after password work; consumption and account creation are atomic.
            if (data.invitation || !settings(db,config).registration) {
              const invitation = validInvitation();
              if (!invitation) throw fail(403,'A valid invitation is required');
              db.prepare('UPDATE invitations SET used_at=? WHERE id=?').run(Date.now(),invitation.id);
            }
            db.prepare('INSERT INTO users (id,username,salt,password_hash,created_at) VALUES (?,?,?,?,?)').run(user.id,username,salt,derived.toString('hex'),Date.now());
            db.exec('COMMIT');
          } catch (err) {
            db.exec('ROLLBACK');
            if (err.code?.startsWith('ERR_SQLITE') && db.prepare('SELECT id FROM users WHERE username=?').get(username)) throw fail(409,'Username unavailable');
            throw err;
          }
        } else {
          const found = db.prepare('SELECT * FROM users WHERE username=?').get(username);
          const derived = await scrypt(password, found?.salt || dummySalt, 64);
          if (!timingSafeEqual(derived, found ? Buffer.from(found.password_hash, 'hex') : dummyHash) || !found || found.disabled) throw fail(401, genericLogin);
          const latest = db.prepare('SELECT role, disabled, password_hash FROM users WHERE id=?').get(found.id);
          if (!latest || latest.disabled || latest.password_hash !== found.password_hash) throw fail(401, genericLogin);
          user = { id: found.id, username: found.username, role: latest.role };
        }
      } finally { pendingPasswordWork--; }
      const csrf = issueSession(res, user);
      return json(res, path === '/api/register' ? 201 : 200, { user, csrf });
    }
    if (path.startsWith('/api/')) {
      const user = session(req);
      if (!user) throw fail(401, 'Please sign in');
      if (req.method === 'POST' && req.headers['x-csrf-token'] !== user.csrf) throw fail(403, 'CSRF token rejected');
      if (path.startsWith('/api/feedback/') || path.startsWith('/api/admin/feedback')) return feedback({req,res,path,url,db,body,json,authenticate:()=>session(req)});
      if (path.startsWith('/api/admin/diagnostics/')) return diagnostics({req,res,path,url,body,json,authenticate:()=>session(req)});
      if (path.startsWith('/api/admin/')) return administer({ req,res,path,db,config,body,json,user,authenticate:()=>session(req) });
      if (path === '/api/me' && req.method === 'GET') return json(res, 200, { user: { id: user.id, username: user.username, role: user.role }, csrf: user.csrf });
      if (path === '/api/logout' && req.method === 'POST') {
        const token = /musixene_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
        res.setHeader('Set-Cookie', `musixene_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.secureCookies ? '; Secure' : ''}`);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/tracks' && req.method === 'GET') return json(res,200,{tracks:listenerTracks(db,user.id)});
      if (path === '/api/collections' && req.method === 'GET') return json(res,200,{collections:listenerCollections(db,listenerTracks(db,user.id))});
      if (path === '/api/catalog' && req.method === 'GET') return json(res,200,catalog(db,user.id));
      const artwork = /^\/api\/tracks\/([a-zA-Z0-9-]+)\/artwork$/.exec(path);
      if (artwork && ['GET','HEAD'].includes(req.method)) {
        const track=db.prepare('SELECT artwork FROM tracks WHERE id=? AND (visible=1 OR ?=1)').get(artwork[1],Number(user.role==='administrator'));
        if (!track?.artwork || basename(track.artwork)!==track.artwork) throw fail(404,'Artwork not found');
        const data=await readFile(join(config.dataDir,'media',track.artwork)).catch(()=>{ throw fail(404,'Artwork unavailable'); });
        res.writeHead(200,{'Content-Type':track.artwork.endsWith('.png')?'image/png':'image/jpeg','Content-Length':data.length});
        return res.end(req.method==='HEAD'?undefined:data);
      }
      const match = /^\/api\/tracks\/([a-zA-Z0-9-]+)\/audio$/.exec(path);
      if (match && ['GET', 'HEAD'].includes(req.method)) {
        const track = db.prepare('SELECT * FROM tracks WHERE id=? AND (visible=1 OR ?=1)').get(match[1],Number(user.role==='administrator'));
        if (!track) throw fail(404, 'Track not found');
        const allowance = await accounting.authorizePlayback({ listenerId: user.id, trackId: track.id });
        if (!allowance.allowed) throw fail(403, 'Playback unavailable');
        if (basename(track.filename) !== track.filename) throw fail(500, 'Invalid media record');
        const filename = join(config.dataDir, 'media', track.filename);
        const info = await stat(filename).catch(() => { throw fail(404, 'Media unavailable'); });
        if (!info.isFile()) throw fail(404, 'Media unavailable');
        const range = req.headers.range ? parseRange(req.headers.range, info.size) : null;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', track.mime);
        if (req.headers.range && !range) {
          res.writeHead(416, { 'Content-Range': `bytes */${info.size}`, 'Content-Length': '0' }); return res.end();
        }
        const start = range?.start ?? 0, end = range?.end ?? info.size - 1;
        if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
        res.setHeader('Content-Length', end - start + 1);
        res.writeHead(range ? 206 : 200);
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(filename, { start, end });
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        return stream.pipe(res);
      }
      throw fail(404, 'API route not found');
    }
    const asset = assets[path];
    if (asset && ['GET', 'HEAD'].includes(req.method)) {
      const data = await readFile(join(webRoot, asset[0]));
      res.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': data.length });
      return res.end(req.method === 'HEAD' ? undefined : data);
    }
    throw fail(404, 'Not found');
  }
  const server = createServer((req, res) => {
    handle(req, res).catch(err => {
      if (res.headersSent) return res.destroy();
      if (!err.status) console.error('Request failed:', err.code || 'internal error');
      json(res, err.status || 500, { error: err.status ? err.message : 'Internal server error' });
    });
  });
  const retention = setInterval(() => {
    try { pruneDiagnostics(db); } catch { console.error('Diagnostic retention cleanup failed'); }
  }, 3600000);
  retention.unref();
  server.once('close', () => clearInterval(retention));
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return { server, db };
}
