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
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';

export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(resolve(directory), 'artist.sqlite'));
  chmodSync(join(resolve(directory), 'artist.sqlite'), 0o600);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
    INSERT OR IGNORE INTO schema_version VALUES (1);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL,
      filename TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  const version = db.prepare('SELECT max(version) AS version FROM schema_version').get().version;
  if (version > 5) { db.close(); throw new Error('Database schema is newer than this application'); }
  if (version < 2) {
    try {
      db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'listener' CHECK(role IN ('listener','administrator'));
        ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1));
        ALTER TABLE tracks ADD COLUMN visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1));
        ALTER TABLE tracks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE tracks ADD COLUMN artwork TEXT;
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE invitations (
          id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, username TEXT,
          expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL
        );
        CREATE TABLE collections (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 0 CHECK(visible IN (0,1)),
          position INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE collection_tracks (
          collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
          track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
          position INTEGER NOT NULL, PRIMARY KEY(collection_id, track_id)
        );
        INSERT INTO schema_version VALUES (2);
        COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (version < 3) {
    try {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE track_likes (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL, PRIMARY KEY(user_id,track_id)
        );
        CREATE INDEX likes_by_track ON track_likes(track_id,created_at);
        CREATE TABLE track_notes (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
          body TEXT NOT NULL, created_at INTEGER NOT NULL, request_id TEXT NOT NULL,
          UNIQUE(user_id,request_id)
        );
        CREATE INDEX notes_by_track ON track_notes(track_id,created_at,id);
        CREATE INDEX notes_by_user ON track_notes(user_id,created_at,id);
        CREATE TABLE feedback_write_limits (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          window_start INTEGER NOT NULL, writes INTEGER NOT NULL
        );
        CREATE TABLE privacy_audit (
          id INTEGER PRIMARY KEY, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE INDEX privacy_audit_time ON privacy_audit(created_at);
        INSERT INTO schema_version VALUES(3);
        COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (version < 4) {
    try {
      db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE tracks ADD COLUMN release_status TEXT NOT NULL DEFAULT 'unpublished' CHECK(release_status IN ('published','unpublished'));
        ALTER TABLE tracks ADD COLUMN explicit_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK(explicit_status IN ('explicit','non_explicit','unreviewed'));
        ALTER TABLE tracks ADD COLUMN content_type TEXT NOT NULL DEFAULT 'other';
        ALTER TABLE tracks ADD COLUMN genres TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(genres) AND json_type(genres)='array');
        ALTER TABLE tracks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags) AND json_type(tags)='array');
        ALTER TABLE collections ADD COLUMN kind TEXT NOT NULL DEFAULT 'curated' CHECK(kind IN ('curated','dynamic'));
        ALTER TABLE collections ADD COLUMN rules TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(rules) AND json_type(rules)='object');
        CREATE INDEX track_classification ON tracks(visible,release_status,content_type,explicit_status);
        INSERT INTO schema_version VALUES(4);
        COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (version < 5) {
    try {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE diagnostic_sessions (
          session_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
          context_id TEXT NOT NULL UNIQUE
        );
        CREATE TABLE diagnostic_recordings (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_hash TEXT REFERENCES sessions(token_hash) ON DELETE SET NULL,
          context_id TEXT NOT NULL, generation INTEGER NOT NULL, started_at INTEGER NOT NULL,
          registered_at INTEGER NOT NULL, digest TEXT, report_id TEXT
        );
        CREATE TABLE diagnostic_reports (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          uploaded_at INTEGER NOT NULL, metadata TEXT NOT NULL, content TEXT NOT NULL
        );
        CREATE INDEX diagnostic_report_owner ON diagnostic_reports(owner_id,uploaded_at);
        INSERT INTO settings VALUES ('diagnostics_enabled','false');
        INSERT INTO settings VALUES ('diagnostics_retention_days','7');
        INSERT INTO settings VALUES ('diagnostics_generation','0');
        INSERT INTO schema_version VALUES(5);
        COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  return db;
}
