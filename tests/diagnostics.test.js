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
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./fixture.js";
import { openDatabase } from "../apps/server/database.js";
import { createApplication } from "../apps/server/app.js";
import { loadConfig } from "../apps/server/config.js";
import { pruneDiagnostics } from "../apps/server/diagnostics.js";
import {
  safeError,
  validateReport,
  LIMITS,
} from "../apps/web/diagnostic-format.js";
const base = "/api/admin/diagnostics";
async function context(f, a) {
  return (await f.request(base + "/context", undefined, a)).json();
}
async function enabled(f, a) {
  assert.equal(
    (
      await f.request(
        base + "/settings",
        { enabled: true, retentionDays: 7 },
        a,
      )
    ).status,
    200,
  );
  return context(f, a);
}
async function recording(f, a, ctx) {
  const id = randomUUID(),
    startedAt = Date.now();
  assert.equal(
    (await f.request(base + "/recordings", { recordingId: id, startedAt }, a))
      .status,
    201,
  );
  const report = {
    reportVersion: 1,
    recordingId: id,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(startedAt + 100).toISOString(),
    durationMs: 100,
    reason: "manual_stop",
    applicationVersion: "0.3.0",
    browser: { name: "Chrome", version: "123.0", os: "Android", mode: "PWA" },
    droppedEvents: 0,
    events: [
      {
        timestamp: new Date(startedAt).toISOString(),
        elapsedMs: 0,
        sequence: 1,
        category: "playback",
        event: "play-request-rejected",
        visibility: "hidden",
        error: {
          name: "NotAllowedError",
          message:
            "play() failed because the user did not interact with the document",
        },
      },
    ],
  };
  return {
    recordingId: id,
    sessionContext: ctx.sessionContext,
    installationId: ctx.installationId,
    report,
  };
}
test("diagnostics default off; operator prohibition cannot be overridden, listeners and CSRF are rejected, private settings absent from public config", async (t) => {
  assert.equal(loadConfig({}).diagnosticsAllowed, false);
  const f = await fixture(t),
    a = await f.login("artist"),
    listener = await f.login("alice"),
    ctx = await context(f, a);
  assert.equal(ctx.allowed, false);
  assert.equal(ctx.enabled, false);
  for (const path of ["/settings", "/recordings", "/reports"])
    assert.equal((await f.request(base + path, {}, listener)).status, 403);
  assert.equal(
    (
      await f.request(
        base + "/settings",
        { enabled: true, retentionDays: 7 },
        a,
      )
    ).status,
    403,
  );
  f.db
    .prepare("UPDATE settings SET value='true' WHERE key='diagnostics_enabled'")
    .run();
  assert.equal(
    (
      await f.request(
        base + "/recordings",
        { recordingId: randomUUID(), startedAt: Date.now() },
        a,
      )
    ).status,
    403,
  );
  assert.equal((await f.request(base + "/reports", {}, a)).status, 403);
  assert.equal(
    (
      await f.request(
        base + "/settings",
        { enabled: false, retentionDays: 7 },
        a,
        { "X-CSRF-Token": "wrong" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        base + "/settings",
        { enabled: false, retentionDays: 7 },
        a,
        { Origin: "https://wrong.invalid" },
      )
    ).status,
    403,
  );
  const publicConfig = await (await f.request("/api/config")).json();
  assert.equal(
    Object.keys(publicConfig).some((k) => k.startsWith("diagnostics_")),
    false,
  );
  assert.equal((await f.request(base + "/context")).status, 401);
});
test("explicit registration, original session and policy generation gate uploads; later sessions cannot reconcile, expiry/role loss/disable denied", async (t) => {
  const f = await fixture(t, { DIAGNOSTICS_ALLOWED: "true" }),
    a = await f.login("artist");
  assert.equal(
    (
      await f.request(
        base + "/recordings",
        { recordingId: randomUUID(), startedAt: Date.now() },
        a,
      )
    ).status,
    403,
  );
  const ctx = await enabled(f, a),
    payload = await recording(f, a, ctx),
    again = await f.login("artist");
  assert.notEqual((await context(f, again)).sessionContext, ctx.sessionContext);
  assert.equal(
    (await f.request(base + "/reports", payload, again)).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        base + "/reports",
        {
          ...payload,
          sessionContext: (await context(f, again)).sessionContext,
        },
        again,
      )
    ).status,
    403,
  );
  const arbitrary = { ...payload, recordingId: randomUUID() };
  assert.equal((await f.request(base + "/reports", arbitrary, a)).status, 403);
  await f.request(base + "/settings", { enabled: false, retentionDays: 7 }, a);
  assert.equal((await f.request(base + "/reports", payload, a)).status, 403);
  await enabled(f, a);
  assert.equal((await f.request(base + "/reports", payload, a)).status, 403);
  const fresh = await recording(f, a, await context(f, a));
  f.db.prepare("UPDATE users SET role='listener' WHERE id=?").run(a.user.id);
  assert.equal((await f.request(base + "/reports", fresh, a)).status, 403);
  f.db
    .prepare("UPDATE users SET role='administrator',disabled=1 WHERE id=?")
    .run(a.user.id);
  assert.equal((await f.request(base + "/reports", fresh, a)).status, 401);
  f.db.prepare("UPDATE users SET disabled=0 WHERE id=?").run(a.user.id);
  f.db.prepare("UPDATE sessions SET expires_at=0").run();
  assert.equal((await f.request(base + "/reports", fresh, a)).status, 401);
});
test("private persistent reports: idempotent duplicate, ownership, exports, deletion, retention and quotas", async (t) => {
  const f = await fixture(t, { DIAGNOSTICS_ALLOWED: "true" }),
    a = await f.login("artist"),
    ctx = await enabled(f, a);
  f.db
    .prepare("UPDATE users SET role='administrator' WHERE username='bob'")
    .run();
  const b = await f.login("bob");
  const payload = await recording(f, a, ctx),
    path = base + "/reports/" + payload.recordingId;
  let response = await f.request(base + "/reports", payload, a);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).saved, true);
  assert.equal((await f.request(base + "/reports", payload, a)).status, 200);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM diagnostic_reports").get().n,
    1,
  );
  const changed = structuredClone(payload);
  changed.report.reason = "logout";
  assert.equal((await f.request(base + "/reports", changed, a)).status, 409);
  assert.equal((await f.request(path, undefined, b)).status, 404);
  assert.equal((await f.request(path + "/delete", {}, b)).status, 404);
  assert.deepEqual(
    (await (await f.request(base + "/reports", undefined, b)).json()).reports,
    [],
  );
  assert.equal(
    (await f.request("/diagnostics/" + payload.recordingId + ".json")).status,
    404,
  );
  assert.equal((await f.request("/api/admin/state", undefined, a)).status, 200);
  const listed = (
    await (await f.request(base + "/reports", undefined, a)).json()
  ).reports[0];
  assert.equal(listed.eventCount, 1);
  assert.equal(listed.browser.os, "Android");
  assert.equal(listed.status, "Saved");
  const exportResponse = await f.request(path + "/export", undefined, a);
  assert.match(exportResponse.headers.get("content-disposition"), /attachment/);
  assert.equal(
    (await exportResponse.json()).events[0].error.name,
    "NotAllowedError",
  );
  const second = createApplication(
    loadConfig({ DATA_DIR: f.directory, APP_ORIGIN: "http://localhost:3000" }),
  );
  await new Promise((r) => second.server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(
      `http://127.0.0.1:${second.server.address().port}` + path,
      { headers: { Cookie: a.cookie } },
    );
    assert.equal(res.status, 200);
    assert.equal(
      second.db
        .prepare("SELECT value FROM settings WHERE key='diagnostics_enabled'")
        .get().value,
      "true",
    );
  } finally {
    await new Promise((r) => second.server.close(r));
    second.db.close();
  }
  await f.request(base + "/settings", { enabled: false, retentionDays: 1 }, a);
  assert.equal((await f.request(path, undefined, a)).status, 200);
  assert.equal((await f.request(path + "/delete", {}, a)).status, 200);
  await enabled(f, a);
  assert.equal((await f.request(base + "/reports", payload, a)).status, 403);
  const retained = await recording(f, a, await context(f, a));
  await f.request(base + "/reports", retained, a);
  f.db.prepare("UPDATE diagnostic_reports SET uploaded_at=0").run();
  pruneDiagnostics(f.db);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM diagnostic_reports").get().n,
    0,
  );
  // Bound registrations even without an upload. No report/event streaming occurs here.
  for (let i = 0; i < 50; i++)
    f.db
      .prepare(
        "INSERT INTO diagnostic_recordings(id,owner_id,context_id,generation,started_at,registered_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        b.user.id,
        "synthetic-context",
        0,
        Date.now(),
        Date.now(),
      );
  assert.equal(
    (
      await f.request(
        base + "/recordings",
        { recordingId: randomUUID(), startedAt: Date.now() },
        b,
      )
    ).status,
    429,
  );
});
test("report validation rejects invalid sequences, excessive events/bytes and private fields; native errors sanitized without losing names", async (t) => {
  const f = await fixture(t, { DIAGNOSTICS_ALLOWED: "true" }),
    a = await f.login("artist"),
    ctx = await enabled(f, a),
    payload = await recording(f, a, ctx);
  for (const change of [
    (p) => (p.report.events[0].password = "secret"),
    (p) => p.report.events.push(p.report.events[0]),
    (p) =>
      (p.report.events = Array(LIMITS.events + 1).fill(p.report.events[0])),
    (p) => (p.report.durationMs = -1),
    (p) => (p.report.reason = "anything"),
  ]) {
    const bad = structuredClone(payload);
    change(bad);
    assert.equal((await f.request(base + "/reports", bad, a)).status, 400);
  }
  assert.equal(
    (
      await f.request(
        base + "/reports",
        { ...payload, excess: "x".repeat(LIMITS.bytes + 65536) },
        a,
      )
    ).status,
    413,
  );
  const sanitized = safeError({
    name: "NotAllowedError",
    message:
      "Blocked https://example.invalid/private.mp3 token=abc password=hello alice@example.invalid " +
      "a".repeat(64),
  });
  assert.equal(sanitized.name, "NotAllowedError");
  assert.doesNotMatch(sanitized.message, /example|abc|hello|a{64}/);
  assert.equal(
    validateReport(payload.report).events[0].error.name,
    "NotAllowedError",
  );
});
test("schema-4 migration is additive, atomic, media safe and repeatable", async (t) => {
  const f = await fixture(t);
  await f.login("artist");
  f.db.exec(
    "DROP TABLE article_images;DROP TABLE articles;DROP TABLE social_links;DELETE FROM schema_version WHERE version=7;DROP TABLE credit_ledger;DROP TABLE qualifying_plays;DROP TABLE play_engagements;ALTER TABLE users DROP COLUMN credit_units;ALTER TABLE users DROP COLUMN credits_unlimited;ALTER TABLE tracks DROP COLUMN price_units;DELETE FROM settings WHERE key='credits_enabled';DELETE FROM schema_version WHERE version=6;DROP TABLE diagnostic_reports;DROP TABLE diagnostic_recordings;DROP TABLE diagnostic_sessions;DELETE FROM settings WHERE key GLOB 'diagnostics_*';DELETE FROM schema_version WHERE version=5",
  );
  const tables = f.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name!='schema_version' ORDER BY name",
    )
    .all()
    .map((r) => r.name);
  const snapshot = () =>
    Object.fromEntries(
      tables.map((name) => [
        name,
        f.db
          .prepare(`SELECT * FROM ${name} ORDER BY rowid`)
          .all()
          .filter((row) => !row.key?.startsWith("diagnostics_") && row.key !== "credits_enabled")
          .map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !['credit_units','credits_unlimited','price_units'].includes(key)))),
      ]),
    );
  const before = snapshot(),
    media = Object.fromEntries(
      readdirSync(join(f.directory, "media")).map((name) => [
        name,
        readFileSync(join(f.directory, "media", name)),
      ]),
    );
  f.db.exec("CREATE TABLE diagnostic_reports(conflict TEXT)");
  assert.throws(() => openDatabase(f.directory), /already exists/);
  assert.equal(
    f.db.prepare("SELECT max(version) AS v FROM schema_version").get().v,
    4,
  );
  assert.equal(
    f.db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='diagnostic_sessions'")
      .get(),
    undefined,
  );
  f.db.exec("DROP TABLE diagnostic_reports");
  for (let i = 0; i < 3; i++) {
    const db = openDatabase(f.directory);
    assert.equal(
      db.prepare("SELECT max(version) AS v FROM schema_version").get().v,
      7,
    );
    db.close();
    assert.deepEqual(snapshot(), before);
  }
  for (const [name, bytes] of Object.entries(media))
    assert.deepEqual(readFileSync(join(f.directory, "media", name)), bytes);
});

test("retained-report quotas reject new uploads; deletion keeps an idempotency receipt and retention settings are bounded", async (t) => {
  const f = await fixture(t, { DIAGNOSTICS_ALLOWED: "true" }),
    a = await f.login("artist"),
    ctx = await enabled(f, a),
    payload = await recording(f, a, ctx);
  for (const retentionDays of [0, 31, 1.5])
    assert.equal(
      (await f.request(base + "/settings", { enabled: true, retentionDays }, a))
        .status,
      400,
    );
  for (let i = 0; i < 20; i++)
    f.db
      .prepare("INSERT INTO diagnostic_reports VALUES(?,?,?,?,?)")
      .run(randomUUID(), a.user.id, Date.now(), "{}", "{}");
  assert.equal((await f.request(base + "/reports", payload, a)).status, 507);
  f.db.prepare("DELETE FROM diagnostic_reports").run();
  assert.equal((await f.request(base + "/reports", payload, a)).status, 201);
  assert.equal(
    (
      await f.request(
        base + "/reports/" + payload.recordingId + "/delete",
        {},
        a,
      )
    ).status,
    200,
  );
  assert.equal((await f.request(base + "/reports", payload, a)).status, 410);
});

test("illustrative diagnostic fixture validates without representing a physical-device capture", () => {
  const sample = JSON.parse(
    readFileSync(
      new URL("./fixtures/diagnostic-report.example.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    validateReport(sample).events.find(
      (e) => e.event === "play-request-rejected",
    ).error.name,
    "NotAllowedError",
  );
});
