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
import { randomUUID } from 'node:crypto';
const fail = (status, message) => Object.assign(new Error(message), { status });

export function pageOptions(url) {
  const page = Number(url.searchParams.get('page') ?? 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 1000000) throw fail(400, 'Invalid page');
  return { page, limit: 50, offset: page * 50 };
}

export async function feedback({ req, res, path, url, db, body, json, authenticate }) {
  // Recheck the session after reading a potentially slow request body.
  const data = req.method === 'POST' ? await body(req, 16384) : null;
  const user = authenticate();
  if (!user) throw fail(401, 'Please sign in');
  const admin = path.startsWith('/api/admin/');
  if (admin && user.role !== 'administrator') throw fail(403, 'Administrator required');
  const { page, limit, offset } = pageOptions(url);
  const audit = action => {
    rateLimit();
    db.prepare('DELETE FROM privacy_audit WHERE created_at<?').run(Date.now()-90*86400000);
    db.prepare('INSERT INTO privacy_audit(actor_id,action,created_at) VALUES(?,?,?)').run(user.id,action,Date.now());
  };
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const rateLimit = () => {
    const now = Date.now();
    const row = db.prepare('SELECT * FROM feedback_write_limits WHERE user_id=?').get(user.id);
    const recent = row && now - row.window_start < 60000;
    if (recent && row.writes >= 20) throw fail(429, 'Too many feedback changes; try again in a minute');
    db.prepare('INSERT INTO feedback_write_limits VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET window_start=excluded.window_start,writes=excluded.writes')
      .run(user.id, recent ? row.window_start : now, recent ? row.writes + 1 : 1);
  };
  const track = /^\/api\/feedback\/tracks\/([a-zA-Z0-9-]+)(?:\/(like|notes))?$/.exec(path);
  if (track) {
    const id = track[1], action = track[2];
    if (req.method === 'GET' && !action) {
      // Own notes remain readable after unpublishing; hidden media stays protected.
      const notes = db.prepare('SELECT id,body,created_at FROM track_notes WHERE user_id=? AND track_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').all(user.id,id,limit+1,offset);
      const published = Boolean(db.prepare('SELECT id FROM tracks WHERE id=? AND visible=1').get(id));
      if (!published && !db.prepare('SELECT 1 FROM track_notes WHERE user_id=? AND track_id=?').get(user.id,id) && !db.prepare('SELECT 1 FROM track_likes WHERE user_id=? AND track_id=?').get(user.id,id)) throw fail(404, 'Track not found');
      return json(res,200,{ liked:Boolean(db.prepare('SELECT 1 FROM track_likes WHERE user_id=? AND track_id=?').get(user.id,id)), notes:notes.slice(0,limit), nextPage:notes.length>limit ? page+1 : null, published });
    }
    if (req.method === 'POST' && ['like','notes'].includes(action)) {
      if (!db.prepare('SELECT id FROM tracks WHERE id=? AND visible=1').get(id)) throw fail(404,'Track not found');
      if (action === 'like') {
        if (typeof data.liked !== 'boolean') throw fail(400,'Boolean liked required');
        transaction(() => {
          const liked = Boolean(db.prepare('SELECT 1 FROM track_likes WHERE user_id=? AND track_id=?').get(user.id,id));
          if (liked === data.liked) return; // Retries do not consume the write allowance.
          rateLimit();
          if (data.liked) db.prepare('INSERT INTO track_likes VALUES(?,?,?)').run(user.id,id,Date.now());
          else db.prepare('DELETE FROM track_likes WHERE user_id=? AND track_id=?').run(user.id,id);
        });
        return json(res,200,{liked:data.liked});
      }
      if (typeof data.body !== 'string' || !data.body.trim() || [...data.body].length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(data.body)) throw fail(400,'Note must contain 1–2,000 characters of plain text');
      if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(data.requestId)) throw fail(400,'A request identifier is required');
      const note = transaction(() => {
        const existing = db.prepare('SELECT id,track_id,body,created_at FROM track_notes WHERE user_id=? AND request_id=?').get(user.id,data.requestId);
        if (existing) {
          if (existing.track_id !== id || existing.body !== data.body.trim()) throw fail(409,'Request identifier already used');
          return existing;
        }
        rateLimit();
        const note = {id:randomUUID(),body:data.body.trim(),created_at:Date.now()};
        db.prepare('INSERT INTO track_notes VALUES(?,?,?,?,?,?)').run(note.id,user.id,id,note.body,note.created_at,data.requestId);
        return note;
      });
      return json(res,201,{note:{id:note.id,body:note.body,created_at:note.created_at}});
    }
  }
  const removal = /^\/api\/(admin\/)?feedback\/notes\/([a-zA-Z0-9-]+)\/delete$/.exec(path);
  if (removal && req.method === 'POST') {
    transaction(() => {
      if (admin) {
        const result = db.prepare('DELETE FROM track_notes WHERE id=?').run(removal[2]);
        if (result.changes) audit('feedback.note.remove');
      } else db.prepare('DELETE FROM track_notes WHERE id=? AND user_id=?').run(removal[2],user.id);
    });
    // Do not reveal whether another person's note exists.
    return json(res,200,{ok:true});
  }
  if (path === '/api/feedback/delete' && req.method === 'POST') {
    transaction(() => {
      db.prepare('DELETE FROM track_notes WHERE user_id=?').run(user.id);
      db.prepare('DELETE FROM track_likes WHERE user_id=?').run(user.id);
      audit('feedback.own.delete');
    });
    return json(res,200,{ok:true});
  }
  if (req.method === 'GET' && ['/api/feedback/history','/api/feedback/export','/api/admin/feedback','/api/admin/feedback/export'].includes(path)) {
    const conditions=[], params=[];
    if (!admin) { conditions.push('f.user_id=?'); params.push(user.id); }
    for (const [query,column] of [['track','track_id'],['listener','user_id']]) {
      const value=url.searchParams.get(query);
      if (admin && value) { if (!/^[a-zA-Z0-9-]{1,64}$/.test(value)) throw fail(400,'Invalid filter'); conditions.push(`f.${column}=?`); params.push(value); }
    }
    const where = conditions.length ? 'WHERE '+conditions.join(' AND ') : '';
    const rows = table => db.prepare(`SELECT f.*,t.title AS track_title${admin?',u.username':''} FROM ${table} f JOIN tracks t ON t.id=f.track_id JOIN users u ON u.id=f.user_id ${where} ORDER BY f.created_at DESC${table==='track_notes'?',f.id DESC':',f.track_id,f.user_id'} LIMIT ? OFFSET ?`).all(...params,limit+1,offset).map(({request_id,...row})=>row);
    const notes=rows('track_notes'), likes=rows('track_likes');
    const count = table => db.prepare(`SELECT count(*) AS n FROM ${table} f ${where}`).get(...params).n;
    if (path.endsWith('/export')) transaction(()=>audit(admin?'feedback.admin.export':'feedback.own.export')); 
    return json(res,200,{notes:notes.slice(0,limit),likes:likes.slice(0,limit),noteCount:count('track_notes'),likeCount:count('track_likes'),page,nextPage:notes.length>limit || likes.length>limit ? page+1 : null});
  }
  throw fail(404,'Feedback route not found');
}
