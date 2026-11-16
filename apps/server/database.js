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
  if (version > 2) { db.close(); throw new Error('Database schema is newer than this application'); }
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
  return db;
}
