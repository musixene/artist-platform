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
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "../apps/server/database.js";
import { fixture } from "./fixture.js";
import { png } from "./png.js";

test("schema-3 upgrade preserves all accounts, sessions, invitations, media, catalog order, branding and private feedback; failure rolls back and startup repeats", async (t) => {
  const f = await fixture(t),
    admin = await f.login("artist"),
    alice = await f.login("alice"),
    db = f.db;
  db.prepare("UPDATE tracks SET visible=0 WHERE id=?").run(f.tracks[1].id);
  writeFileSync(join(f.directory, "media", "existing-art.png"), png(128, 128));
  db.prepare("UPDATE tracks SET artwork=? WHERE id=?").run(
    "existing-art.png",
    f.tracks[0].id,
  );
  db.prepare("INSERT INTO invitations VALUES(?,?,?,?,?,?)").run(
    "existing-invite",
    "existing-hash",
    "invited",
    Date.now() + 3600000,
    null,
    Date.now(),
  );
  db.prepare(
    "INSERT INTO collections(id,title,visible,position) VALUES(?,?,?,?)",
  ).run("existing-catalog", "Existing catalog", 1, 7);
  db.prepare("INSERT INTO collection_tracks VALUES(?,?,?)").run(
    "existing-catalog",
    f.tracks[2].id,
    0,
  );
  db.prepare("INSERT INTO collection_tracks VALUES(?,?,?)").run(
    "existing-catalog",
    f.tracks[0].id,
    1,
  );
  for (const [key, value] of Object.entries({
    name: "Existing Artist",
    tagline: "Existing tagline",
    accent: "#aabbcc",
    registration: false,
  }))
    db.prepare("INSERT INTO settings VALUES(?,?)").run(
      key,
      JSON.stringify(value),
    );
  db.prepare("INSERT INTO track_likes VALUES(?,?,?)").run(
    alice.user.id,
    f.tracks[0].id,
    Date.now(),
  );
  db.prepare("INSERT INTO track_notes VALUES(?,?,?,?,?,?)").run(
    "existing-note",
    alice.user.id,
    f.tracks[0].id,
    "Existing private note",
    Date.now(),
    "existing-request",
  );
  db.prepare("INSERT INTO feedback_write_limits VALUES(?,?,?)").run(
    alice.user.id,
    Date.now(),
    3,
  );
  db.prepare(
    "INSERT INTO privacy_audit(actor_id,action,created_at) VALUES(?,?,?)",
  ).run(admin.user.id, "feedback.admin.export", Date.now());
  db.exec("DROP TABLE article_images;DROP TABLE articles;DROP TABLE social_links;DELETE FROM schema_version WHERE version=7;DROP TABLE credit_ledger;DROP TABLE qualifying_plays;DROP TABLE play_engagements;ALTER TABLE users DROP COLUMN credit_units;ALTER TABLE users DROP COLUMN credits_unlimited;ALTER TABLE tracks DROP COLUMN price_units;DELETE FROM settings WHERE key='credits_enabled';DELETE FROM schema_version WHERE version=6;DROP TABLE diagnostic_reports;DROP TABLE diagnostic_recordings;DROP TABLE diagnostic_sessions;DELETE FROM settings WHERE key GLOB 'diagnostics_*';DELETE FROM schema_version WHERE version=5;");
  // This fixture removes only the new schema-4 additions, reconstructing the deployed schema-3 shape.
  db.exec(
    "DROP INDEX track_classification;ALTER TABLE tracks DROP COLUMN release_status;ALTER TABLE tracks DROP COLUMN explicit_status;ALTER TABLE tracks DROP COLUMN content_type;ALTER TABLE tracks DROP COLUMN genres;ALTER TABLE tracks DROP COLUMN tags;ALTER TABLE collections DROP COLUMN kind;ALTER TABLE collections DROP COLUMN rules;DELETE FROM schema_version WHERE version=4",
  );
  const tables = [
    "users",
    "sessions",
    "invitations",
    "tracks",
    "collections",
    "collection_tracks",
    "settings",
    "track_likes",
    "track_notes",
    "feedback_write_limits",
    "privacy_audit",
  ];
  const before = Object.fromEntries(
    tables.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table}${table === "settings" ? " WHERE key NOT GLOB 'diagnostics_*' AND key!='credits_enabled'" : ""} ORDER BY rowid`).all(),
    ]),
  );
  const media = Object.fromEntries(
    readdirSync(join(f.directory, "media")).map((name) => [
      name,
      readFileSync(join(f.directory, "media", name)),
    ]),
  );
  // A late migration conflict must undo every preceding ALTER TABLE.
  db.exec("CREATE INDEX track_classification ON users(username)");
  assert.throws(() => openDatabase(f.directory), /already exists/);
  assert.equal(
    db.prepare("SELECT max(version) AS v FROM schema_version").get().v,
    3,
  );
  assert.equal(
    db
      .prepare("PRAGMA table_info(tracks)")
      .all()
      .some((c) => c.name === "release_status"),
    false,
  );
  for (const table of tables)
    assert.deepEqual(
      db.prepare(`SELECT * FROM ${table}${table === "settings" ? " WHERE key NOT GLOB 'diagnostics_*' AND key!='credits_enabled'" : ""} ORDER BY rowid`).all(),
      before[table],
    );
  db.exec("DROP INDEX track_classification");
  for (let i = 0; i < 3; i++) {
    const migrated = openDatabase(f.directory);
    assert.equal(
      migrated.prepare("SELECT max(version) AS v FROM schema_version").get().v,
      7,
    );
    for (const table of tables) {
      const rows = migrated
        .prepare(`SELECT * FROM ${table}${table === "settings" ? " WHERE key NOT GLOB 'diagnostics_*' AND key!='credits_enabled'" : ""} ORDER BY rowid`)
        .all();
      assert.equal(rows.length, before[table].length);
      rows.forEach((row, index) => {
        for (const [key, value] of Object.entries(before[table][index]))
          assert.equal(row[key], value);
      });
    }
    for (const track of migrated.prepare("SELECT * FROM tracks").all()) {
      assert.equal(track.release_status, "unpublished");
      assert.equal(track.explicit_status, "unreviewed");
      assert.equal(track.content_type, "other");
      assert.equal(track.genres, "[]");
      assert.equal(track.tags, "[]");
    }
    assert.equal(
      migrated.prepare("SELECT kind FROM collections").get().kind,
      "curated",
    );
    migrated.close();
    assert.deepEqual(
      readdirSync(join(f.directory, "media")).sort(),
      Object.keys(media).sort(),
    );
    for (const [name, bytes] of Object.entries(media))
      assert.deepEqual(readFileSync(join(f.directory, "media", name)), bytes);
  }
  assert.equal((await f.request("/api/me", undefined, alice)).status, 200);
  const catalog = await (
    await f.request("/api/catalog", undefined, alice)
  ).json();
  assert.equal(catalog.tracks.length, 2);
  assert.deepEqual(
    catalog.catalogs.find((c) => c.id === "existing-catalog").trackIds,
    [f.tracks[2].id, f.tracks[0].id],
  );
  assert.equal(
    (
      await f.request(`/api/tracks/${f.tracks[0].id}/audio`, undefined, alice, {
        Range: "bytes=44-99",
      })
    ).status,
    206,
  );
  assert.equal(
    (await f.request(`/api/tracks/${f.tracks[1].id}/audio`, undefined, alice))
      .status,
    404,
  );
  const state = await (
    await f.request("/api/admin/state", undefined, admin)
  ).json();
  assert.equal(state.settings.name, "Existing Artist");
  const feedback = await (
    await f.request("/api/feedback/history", undefined, alice)
  ).json();
  assert.equal(feedback.notes[0].body, "Existing private note");
  assert.equal(feedback.likeCount, 1);
});
