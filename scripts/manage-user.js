// Operator-only account creation/password reset. Password comes from stdin, never argv.
import { randomBytes, randomUUID, scrypt as derive } from 'node:crypto';
import { promisify } from 'node:util';
import { openDatabase } from '../apps/server/database.js';
process.umask(0o077);
const requestedRole = process.argv[3];
if (requestedRole && !['listener', 'administrator'].includes(requestedRole)) throw new Error('Role must be listener or administrator');
const username = (process.argv[2] || '').trim().toLowerCase();
if (!/^[a-z0-9_.-]{3,40}$/.test(username)) throw new Error('Pass a valid username and optional listener/administrator role');
let password = '';
for await (const chunk of process.stdin) { password += chunk; if (password.length > 256) throw new Error('Password too long'); }
password = password.replace(/\r?\n$/, '');
if (password.length < 12 || password.length > 128) throw new Error('Password must be 12–128 characters');
const salt = randomBytes(16).toString('hex');
const derived = await promisify(derive)(password, salt, 64);
const db = openDatabase(process.env.DATA_DIR || 'data');
try {
  db.exec('BEGIN IMMEDIATE');
  const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (existing) {
    db.prepare('UPDATE users SET salt=?, password_hash=? WHERE id=?').run(salt, derived.toString('hex'), existing.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
  } else db.prepare('INSERT INTO users (id, username, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), username, salt, derived.toString('hex'), Date.now());
  if (requestedRole) {
    const account = db.prepare('SELECT id, role, disabled FROM users WHERE username=?').get(username);
    if (account.role === 'administrator' && requestedRole !== 'administrator' && !db.prepare("SELECT id FROM users WHERE role='administrator' AND disabled=0 AND id<>?").get(account.id)) throw new Error('Cannot demote the last active administrator');
    db.prepare('UPDATE users SET role=?, disabled=0 WHERE id=?').run(requestedRole, account.id);
  }
  db.exec('COMMIT'); console.log('Account saved; previous sessions revoked if password was reset.');
} catch (error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }
