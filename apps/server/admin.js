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
import { randomBytes, randomUUID, createHash, scryptSync } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { metadata, rules, decodeTrack } from './catalog.js';
import { validateBrandingPNG } from './branding.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(400, `Text required (maximum ${max} characters)`);
  return value.trim();
};
const flag = value => { if (typeof value !== 'boolean') throw fail(400, 'Boolean required'); return Number(value); };
const position = value => { if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw fail(400, 'Invalid position'); return value; };
export function settings(db, config) {
  return { ...config.branding, registration: config.registration, ...Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(row => [row.key, JSON.parse(row.value)])) };
}
// Stream directly to a private, exclusive file. Client filenames never become paths.
async function upload(req, directory, artwork, maxBytes) {
  const types = artwork ? { 'image/png': ['.png', b => b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))], 'image/jpeg': ['.jpg', b => b[0]===255 && b[1]===216 && b[2]===255] }
    : { 'audio/wav': ['.wav', b => b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WAVE'], 'audio/mpeg': ['.mp3', b => b.toString('ascii',0,3)==='ID3' || (b[0]===255 && (b[1]&224)===224)], 'audio/mp4': ['.m4a', b => b.toString('ascii',4,8)==='ftyp'], 'audio/ogg': ['.ogg', b => b.toString('ascii',0,4)==='OggS'] };
  const mime = req.headers['content-type'], type = types[mime];
  if (!type) throw fail(415, 'Unsupported media type');
  const limit = maxBytes ?? (artwork ? 5 : 512) * 1024 * 1024;
  if (Number(req.headers['content-length']) > limit) throw fail(413, 'Upload too large');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = randomUUID() + type[0], target = join(directory, filename);
  const file = await open(target, 'wx', 0o600);
  try {
    let size = 0, header = Buffer.alloc(0);
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw fail(413, 'Upload too large');
      if (header.length < 16) header = Buffer.concat([header, chunk.subarray(0,16-header.length)]);
      await file.writeFile(chunk);
    }
    if (size < 12 || !type[1](header)) throw fail(400, 'File signature does not match media type');
    await file.sync();
    return { filename, mime, target };
  } catch (error) { await unlink(target).catch(() => {}); throw error; }
  finally { await file.close(); }
}
export async function administer({ req, res, path, db, config, body, json, user, authenticate }) {
  if (user.role !== 'administrator') throw fail(403, 'Administrator required');
  if (req.method === 'GET' && path === '/api/admin/state') return json(res, 200, {
    settings: settings(db, config),
    users: db.prepare('SELECT id, username, role, disabled, created_at FROM users ORDER BY username').all(),
    tracks: db.prepare('SELECT id,title,artist,visible,position,artwork,release_status,explicit_status,content_type,genres,tags FROM tracks ORDER BY position,created_at,id').all().map(decodeTrack),
    invitations: db.prepare('SELECT id,username,expires_at,used_at,created_at FROM invitations ORDER BY created_at DESC').all(),
    collections: db.prepare('SELECT * FROM collections ORDER BY position,id').all().map(c => ({ ...c, rules:JSON.parse(c.rules), trackIds: db.prepare('SELECT track_id FROM collection_tracks WHERE collection_id=? ORDER BY position').all(c.id).map(t=>t.track_id) }))
  });
  if (req.method !== 'POST') throw fail(404, 'Administration route not found');
  const authorized = () => { if(authenticate && authenticate()?.role!=='administrator')throw fail(403,'Administrator session no longer valid'); };
  const brand=/^\/api\/admin\/branding\/(logo|favicon|icon192|icon512)(\/clear)?$/.exec(path);
  if(brand){
    const kind=brand[1];
    if(brand[2]){await body(req);authorized();db.prepare('DELETE FROM settings WHERE key=?').run(kind);return json(res,200,{ok:true});}
    if(req.headers['content-type']!=='image/png')throw fail(415,'Branding requires PNG images');
    const file=await upload(req,join(config.dataDir,'branding'),true,2*1024*1024);
    try{
      validateBrandingPNG(await readFile(file.target),kind);authorized();
      db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(kind,JSON.stringify(file.filename));
    }catch(error){await unlink(file.target).catch(()=>{});throw error;}
    return json(res,200,{ok:true});
  }
  const media = /^\/api\/admin\/tracks\/([a-zA-Z0-9-]+)\/(audio|artwork)$/.exec(path);
  if (media) {
    if (!db.prepare('SELECT id FROM tracks WHERE id=?').get(media[1])) throw fail(404,'Track not found');
    const artwork = media[2] === 'artwork';
    const file = await upload(req, join(config.dataDir, 'media'), artwork);
    try {
      authorized();
      if (artwork) db.prepare('UPDATE tracks SET artwork=? WHERE id=?').run(file.filename, media[1]);
      else db.prepare('UPDATE tracks SET filename=?,mime=? WHERE id=?').run(file.filename,file.mime,media[1]);
    } catch (error) { await unlink(file.target); throw error; }
    // Retain superseded media for operator reconciliation; never delete existing music.
    return json(res,200,{ ok:true });
  }
  const data = await body(req, 65536);
  authorized();
  if (path === '/api/admin/settings') {
    const value = { name: text(data.name,100), tagline: typeof data.tagline==='string' && data.tagline.length<=200 ? data.tagline.trim() : text(data.tagline,200), accent: data.accent, registration: Boolean(flag(data.registration)) };
    for(const [field,max] of [['wordmark',100],['pwaName',100],['pwaShortName',30]])if(data[field]!==undefined){if(typeof data[field]!=='string'||data[field].length>max)throw fail(400,'Invalid branding text');value[field]=data[field].trim();}
    if (!/^#[0-9a-f]{6}$/i.test(value.accent || '')) throw fail(400,'Invalid accent color');
    db.exec('BEGIN IMMEDIATE');
    try { for (const [key,val] of Object.entries(value)) db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(val)); db.exec('COMMIT'); }
    catch(error) { db.exec('ROLLBACK'); throw error; }
    return json(res,200,{ ok:true });
  }
  if (path === '/api/admin/invitations') {
    const username = data.username ? text(data.username,40).toLowerCase() : null;
    if (username && !/^[a-z0-9_.-]{3,40}$/.test(username)) throw fail(400,'Invalid username');
    if (!Number.isInteger(data.hours) || data.hours < 1 || data.hours > 720) throw fail(400,'Expiry must be 1–720 hours');
    const token = randomBytes(32).toString('hex'), id=randomUUID(), expiresAt=Date.now()+data.hours*3600000;
    db.prepare('INSERT INTO invitations VALUES (?,?,?,?,NULL,?)').run(id,hash(token),username,expiresAt,Date.now());
    return json(res,201,{ id, token, expiresAt });
  }
  const invitation = /^\/api\/admin\/invitations\/([a-zA-Z0-9-]+)\/revoke$/.exec(path);
  if (invitation) { db.prepare('UPDATE invitations SET expires_at=0 WHERE id=?').run(invitation[1]); return json(res,200,{ok:true}); }
  const listener = /^\/api\/admin\/users\/([a-zA-Z0-9-]+)$/.exec(path);
  if (listener) {
    const account = db.prepare('SELECT * FROM users WHERE id=?').get(listener[1]);
    if (!account) throw fail(404,'Account not found');
    if (!['listener','administrator'].includes(data.role)) throw fail(400,'Invalid role');
    const disabled = flag(data.disabled);
    if (account.role === 'administrator' && !account.disabled && (disabled || data.role !== 'administrator') && !db.prepare("SELECT id FROM users WHERE role='administrator' AND disabled=0 AND id<>?").get(account.id)) throw fail(409,'Cannot remove the last active administrator');
    let credentials;
    if (data.password !== undefined) {
      if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length >128) throw fail(400,'Password must be 12–128 characters');
      const salt=randomBytes(16).toString('hex'); credentials=[salt,scryptSync(data.password,salt,64).toString('hex')];
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE users SET role=?,disabled=? WHERE id=?').run(data.role,disabled,account.id);
      if (credentials) db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').run(...credentials,account.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
    return json(res,200,{ok:true});
  }
  if (path === '/api/admin/tracks') {
    const id=randomUUID();
    // A draft has no playable asset until uploaded.
    db.prepare('INSERT INTO tracks (id,title,artist,filename,mime,created_at,visible) VALUES (?,?,?,?,?,?,0)').run(id,text(data.title,200),text(data.artist,100),`${id}.pending`,'audio/wav',Date.now());
    return json(res,201,{id});
  }
  const track = /^\/api\/admin\/tracks\/([a-zA-Z0-9-]+)$/.exec(path);
  if (track) {
    const record=db.prepare('SELECT * FROM tracks WHERE id=?').get(track[1]);
    if (!record) throw fail(404,'Track not found');
    const visible=flag(data.visible);
    if (visible && record.filename.endsWith('.pending')) throw fail(409,'Upload audio before making this track available');
    const meta=metadata(data,record);
    db.prepare('UPDATE tracks SET title=?,artist=?,visible=?,position=?,artwork=?,release_status=?,explicit_status=?,content_type=?,genres=?,tags=? WHERE id=?').run(text(data.title,200),text(data.artist,100),visible,position(data.position),data.removeArtwork ? null : record.artwork,meta.release_status,meta.explicit_status,meta.content_type,JSON.stringify(meta.genres),JSON.stringify(meta.tags),record.id);
    return json(res,200,{ok:true});
  }
  if (path === '/api/admin/collections') {
    const id=data.id || randomUUID(), title=text(data.title,200), visible=flag(data.visible), order=position(data.position);
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(id)) throw fail(400,'Invalid collection id');
    const previous=db.prepare('SELECT kind,rules FROM collections WHERE id=?').get(id);
    const kind=data.kind ?? previous?.kind ?? 'curated';
    if(!['curated','dynamic'].includes(kind))throw fail(400,'Invalid catalog type');
    const filters=kind==='dynamic'?rules(data.rules ?? JSON.parse(previous?.rules||'{}')):{};
    const trackIds=kind==='dynamic'?[]:data.trackIds;
    if (!Array.isArray(trackIds) || trackIds.length >1000 || new Set(trackIds).size !== trackIds.length || trackIds.some(id=>typeof id!=='string' || !db.prepare('SELECT id FROM tracks WHERE id=?').get(id))) throw fail(400,'Invalid or duplicate collection tracks');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO collections(id,title,visible,position,kind,rules) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,visible=excluded.visible,position=excluded.position,kind=excluded.kind,rules=excluded.rules').run(id,title,visible,order,kind,JSON.stringify(filters));
      db.prepare('DELETE FROM collection_tracks WHERE collection_id=?').run(id);
      trackIds.forEach((trackId,i)=>db.prepare('INSERT INTO collection_tracks VALUES (?,?,?)').run(id,trackId,i));
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
    return json(res,200,{id});
  }
  const collection = /^\/api\/admin\/collections\/([a-zA-Z0-9-]+)\/delete$/.exec(path);
  if (collection) { db.prepare('DELETE FROM collections WHERE id=?').run(collection[1]); return json(res,200,{ok:true}); }
  throw fail(404,'Administration route not found');
}
