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
import { openDatabase } from "../apps/server/database.js";
import { creditUnits, wallet } from "../apps/server/listening.js";
import { QualifyingClock } from "../apps/web/listening.js";
import { fixture } from "./fixture.js";
async function setup(t) {
  let time = Date.now();
  const f = await fixture(t, {}, { listeningNow: () => time });
  const alice = await f.login("alice"),
    bob = await f.login("bob"),
    admin = await f.login("artist");
  const track = f.tracks[0].id;
  f.db.prepare("UPDATE tracks SET price_units=1250 WHERE id=?").run(track);
  const post = async (path, data, auth = alice) => {
    const r = await f.request(path, data, auth);
    return { status: r.status, data: await r.json() };
  };
  const grant = (
    user = alice,
    amount = "5",
    unlimited = false,
    id = randomUUID(),
  ) =>
    post(
      "/api/admin/listening/listener",
      {
        userId: user.user.id,
        requestId: id,
        amount,
        unlimited,
        reason: "Synthetic grant",
      },
      admin,
    );
  const start = (id = randomUUID(), durationMs = 120000, auth = alice) =>
    post(
      "/api/listening/start",
      {
        id,
        trackId: track,
        durationMs,
        expectedPriceUnits: f.db
          .prepare("SELECT price_units FROM tracks WHERE id=?")
          .get(track).price_units,
        expectedCharging: wallet(f.db, alice.user.id, time).enabled,
      },
      auth,
    );
  await post("/api/admin/listening/settings", { enabled: true }, admin);
  return {
    ...f,
    alice,
    bob,
    admin,
    track,
    post,
    grant,
    start,
    tick: (ms) => {
      time += ms;
    },
    now: () => time,
  };
}
test("qualifying clock excludes pauses, buffering, seeks and unobserved gaps; resume retains progress and qualification caps at 60s", () => {
  const c = new QualifyingClock();
  let position = 0,
    now = 0;
  const sample = (ms, active = true, seek = false, advance = ms) =>
    c.sample({
      position: (position += advance / 1000),
      now: (now += ms),
      active,
      seeking: seek,
    });
  sample(0);
  for (let i = 0; i < 20; i++) sample(1000);
  assert.equal(c.total, 20000);
  sample(0, false);
  sample(10000, false, false, 0);
  sample(0, true, false, 0);
  sample(1000);
  assert.equal(c.total, 21000);
  sample(1000, false, true, 50000);
  sample(0, true);
  sample(1000);
  assert.equal(c.total, 22000);
  sample(30000);
  assert.equal(c.total, 22000);
  for (let i = 0; i < 40; i++) sample(1000);
  assert.equal(c.total, 60000);
  sample(1000);
  assert.equal(c.total, 60000);
});
test("fixed precision credits reject rounding/overflow and malformed values", () => {
  assert.equal(creditUnits("0.001"), 1);
  assert.equal(creditUnits("1.25"), 1250);
  assert.equal(creditUnits("1000000"), 1000000000);
  for (const v of ["1.0001", "1e3", "-1", " 1", "01", "1000000.001", 1, NaN])
    assert.throws(() => creditUnits(v));
});
test("finite engagement reserves funds then atomically counts and charges once at 60s, including concurrent retries and restart", async (t) => {
  const f = await setup(t);
  await f.grant();
  const id = randomUUID();
  assert.equal((await f.start(id)).status, 200);
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).heldUnits, 1250);
  assert.equal(
    (await f.post("/api/listening/qualify", { id, playedMs: 59999 })).status,
    400,
  );
  assert.equal(
    (await f.post("/api/listening/qualify", { id, playedMs: 60000 })).status,
    400,
  );
  f.tick(60000);
  const replies = await Promise.all(
    [1, 2, 3].map(() =>
      f.post("/api/listening/qualify", { id, playedMs: 60000 }),
    ),
  );
  assert.ok(
    replies.every((r) => r.status === 200 && r.data.chargedUnits === 1250),
  );
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
    1,
  );
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).balanceUnits, 3750);
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).heldUnits, 0);
  const reopened = openDatabase(f.directory);
  assert.equal(wallet(reopened, f.alice.user.id, f.now()).balanceUnits, 3750);
  reopened.close();
  assert.equal((await f.start(id)).status, 200);
  assert.equal(
    f.db
      .prepare("SELECT count(*) AS n FROM credit_ledger WHERE engagement_id=?")
      .get(id).n,
    1,
  );
  assert.throws(
    () => f.db.prepare("DELETE FROM credit_ledger").run(),
    /append-only/,
  );
});
test("leaving before threshold releases holds without skip analytics; separate selections/repeat engagements each qualify once", async (t) => {
  const f = await setup(t);
  await f.grant();
  const skipped = randomUUID();
  await f.start(skipped);
  await f.post("/api/listening/close", { id: skipped });
  f.tick(60000);
  assert.equal(
    (await f.post("/api/listening/qualify", { id: skipped, playedMs: 60000 }))
      .status,
    410,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
    0,
  );
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).heldUnits, 0);
  for (let i = 0; i < 2; i++) {
    const id = randomUUID();
    await f.start(id);
    f.tick(60000);
    await f.post("/api/listening/qualify", { id, playedMs: 60000 });
  }
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).balanceUnits, 2500);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
    2,
  );
});
test("unlimited grants are administrator-only, idempotent and audited; eligibility changes release holds without retroactive charges", async (t) => {
  const f = await setup(t);
  await f.grant();
  const id = randomUUID();
  await f.start(id);
  const requestId = randomUUID();
  assert.equal((await f.grant(f.alice, "0", true, requestId)).status, 200);
  assert.equal((await f.grant(f.alice, "0", true, requestId)).status, 200);
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).heldUnits, 0);
  f.tick(60000);
  assert.equal(
    (await f.post("/api/listening/qualify", { id, playedMs: 60000 })).data
      .chargedUnits,
    0,
  );
  await f.grant(f.alice, "0", false);
  const other = randomUUID();
  await f.start(other);
  f.tick(60000);
  assert.equal(
    (await f.post("/api/listening/qualify", { id: other, playedMs: 60000 }))
      .data.chargedUnits,
    1250,
  );
  assert.equal(
    (
      await f.post("/api/admin/listening/listener", {
        userId: f.alice.user.id,
        requestId: randomUUID(),
        amount: "999",
        unlimited: true,
        reason: "Forbidden",
      })
    ).status,
    403,
  );
  assert.equal((await f.grant(f.alice, "0", false, requestId)).status, 409);
});
test("insufficient funds, parallel holds, price snapshots, free/short tracks and disabled charging preserve listener-favorable accounting", async (t) => {
  const f = await setup(t);
  await f.grant(f.alice, "1.25");
  const ids = [randomUUID(), randomUUID()];
  const r = await Promise.all(ids.map((id) => f.start(id)));
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 402]);
  const id = ids[r.findIndex((x) => x.status === 200)];
  f.db.prepare("UPDATE tracks SET price_units=9999 WHERE id=?").run(f.track);
  f.tick(60000);
  assert.equal(
    (await f.post("/api/listening/qualify", { id, playedMs: 60000 })).data
      .chargedUnits,
    1250,
  );
  const short = randomUUID();
  assert.equal((await f.start(short, 59999)).status, 200);
  f.tick(60000);
  assert.equal(
    (await f.post("/api/listening/qualify", { id: short, playedMs: 60000 }))
      .status,
    400,
  );
  await f.post("/api/listening/close", { id: short });
  await f.post("/api/admin/listening/settings", { enabled: false }, f.admin);
  const free = randomUUID();
  await f.start(free);
  f.tick(60000);
  assert.equal(
    (await f.post("/api/listening/qualify", { id: free, playedMs: 60000 })).data
      .chargedUnits,
    0,
  );
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).balanceUnits, 0);
});
test("auth, CSRF, ownership, hidden tracks, expiry, analytics privacy/export/retention and ledger adjustment safety", async (t) => {
  const f = await setup(t);
  await f.grant();
  const id = randomUUID();
  await f.start(id);
  assert.equal((await f.request("/api/listening/account")).status, 401);
  assert.equal(
    (
      await f.request("/api/listening/close", { id }, f.alice, {
        "X-CSRF-Token": "bad",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/api/listening/close", { id }, f.alice, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.post("/api/listening/close", { id }, f.bob)).status,
    404,
  );
  assert.equal(
    (await f.request("/api/admin/listening", undefined, f.alice)).status,
    403,
  );
  f.db.prepare("UPDATE tracks SET visible=0 WHERE id=?").run(f.track);
  assert.equal((await f.start()).status, 404);
  f.db.prepare("UPDATE tracks SET visible=1 WHERE id=?").run(f.track);
  f.tick(60000);
  await f.post("/api/listening/qualify", { id, playedMs: 60000 });
  const exported = await (
    await f.request("/api/listening/export", undefined, f.alice)
  ).json();
  assert.equal(exported.plays.length, 1);
  assert.equal(
    (await (await f.request("/api/listening/export", undefined, f.bob)).json())
      .plays.length,
    0,
  );
  await f.post("/api/listening/erase", {});
  assert.equal(
    (
      await (
        await f.request("/api/listening/export", undefined, f.alice)
      ).json()
    ).plays.length,
    0,
  );
  assert.equal(
    (
      await (await f.request("/api/admin/listening", undefined, f.admin)).json()
    ).tracks.find((t) => t.id === f.track).plays,
    1,
  );
  const expired = randomUUID();
  await f.start(expired);
  f.tick(86400001);
  assert.equal(
    (await f.post("/api/listening/qualify", { id: expired, playedMs: 60000 }))
      .status,
    410,
  );
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).heldUnits, 0);
  f.tick(90 * 86400000);
  await f.request("/api/admin/listening", undefined, f.admin);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
    0,
  );
  assert.equal(
    f.db
      .prepare("SELECT count(*) AS n FROM credit_ledger WHERE engagement_id=?")
      .get(id).n,
    1,
  );
});

test("schema-5 upgrade is atomic and repeatable, preserving all existing records and exact media bytes with charging disabled", async (t) => {
  const f = await fixture(t);
  await f.login("artist");
  f.db.exec(
    "DROP TABLE credit_ledger;DROP TABLE qualifying_plays;DROP TABLE play_engagements;ALTER TABLE users DROP COLUMN credit_units;ALTER TABLE users DROP COLUMN credits_unlimited;ALTER TABLE tracks DROP COLUMN price_units;DELETE FROM settings WHERE key='credits_enabled';DELETE FROM schema_version WHERE version=6;",
  );
  const names = f.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  const before = Object.fromEntries(
    names.map((name) => [
      name,
      f.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(),
    ]),
  );
  const media = Object.fromEntries(
    readdirSync(join(f.directory, "media")).map((name) => [
      name,
      readFileSync(join(f.directory, "media", name)),
    ]),
  );
  f.db.exec("CREATE TABLE credit_ledger(conflict TEXT)");
  assert.throws(() => openDatabase(f.directory), /already exists/);
  assert.equal(
    f.db.prepare("SELECT max(version) AS v FROM schema_version").get().v,
    5,
  );
  assert.ok(
    !f.db
      .prepare("PRAGMA table_info(users)")
      .all()
      .some((c) => c.name === "credit_units"),
  );
  for (const name of names)
    assert.deepEqual(
      f.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(),
      before[name],
    );
  f.db.exec("DROP TABLE credit_ledger");
  for (let i = 0; i < 3; i++) {
    const db = openDatabase(f.directory);
    assert.equal(
      db.prepare("SELECT max(version) AS v FROM schema_version").get().v,
      6,
    );
    for (const name of names.filter(
      (n) => n !== "schema_version" && n !== "settings",
    )) {
      const rows = db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();
      assert.equal(rows.length, before[name].length);
      rows.forEach((r, i) => {
        for (const [k, v] of Object.entries(before[name][i]))
          assert.equal(r[k], v);
      });
    }
    for (const row of before.settings)
      assert.deepEqual(
        db.prepare("SELECT * FROM settings WHERE key=?").get(row.key),
        row,
      );
    assert.equal(
      db.prepare("SELECT value FROM settings WHERE key='credits_enabled'").get()
        .value,
      "false",
    );
    assert.ok(
      db
        .prepare("SELECT credit_units,credits_unlimited FROM users")
        .all()
        .every((u) => u.credit_units === 0 && u.credits_unlimited === 0),
    );
    assert.ok(
      db
        .prepare("SELECT price_units FROM tracks")
        .all()
        .every((t) => t.price_units === 0),
    );
    db.close();
  }
  for (const [name, bytes] of Object.entries(media))
    assert.deepEqual(readFileSync(join(f.directory, "media", name)), bytes);
});

test("stale price is never charged, replacing an unfinished engagement atomically releases its hold, and adjustments cannot spend held funds", async (t) => {
  const f = await setup(t);
  await f.grant(f.alice, "1.25");
  const first = randomUUID();
  await f.start(first);
  const adjust = await f.post(
    "/api/admin/listening/listener",
    {
      userId: f.alice.user.id,
      requestId: randomUUID(),
      amount: "0.001",
      subtract: true,
      unlimited: false,
      reason: "Synthetic correction",
    },
    f.admin,
  );
  assert.equal(adjust.status, 409);
  const next = randomUUID();
  assert.equal(
    (
      await f.post("/api/listening/start", {
        id: next,
        previousId: first,
        trackId: f.track,
        durationMs: 120000,
        expectedPriceUnits: 1250,
        expectedCharging: true,
      })
    ).status,
    200,
  );
  assert.equal(
    f.db.prepare("SELECT state FROM play_engagements WHERE id=?").get(first)
      .state,
    "closed",
  );
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).heldUnits, 1250);
  await f.post("/api/listening/close", { id: next });
  const stale = await f.post("/api/listening/start", {
    id: randomUUID(),
    trackId: f.track,
    durationMs: 120000,
    expectedPriceUnits: 1,
    expectedCharging: true,
  });
  assert.equal(stale.status, 409);
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).heldUnits, 0);
});

test("a settlement failure rolls back debit, analytics and hold release; retry after recovery commits exactly once", async (t) => {
  const f = await setup(t);
  await f.grant();
  const id = randomUUID();
  await f.start(id);
  f.tick(60000);
  f.db.exec(
    "CREATE TRIGGER synthetic_settlement_failure BEFORE INSERT ON qualifying_plays BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
  );
  assert.equal(
    (await f.post("/api/listening/qualify", { id, playedMs: 60000 })).status,
    500,
  );
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).balanceUnits, 5000);
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).heldUnits, 1250);
  assert.equal(
    f.db
      .prepare("SELECT count(*) AS n FROM credit_ledger WHERE engagement_id=?")
      .get(id).n,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
    0,
  );
  f.db.exec("DROP TRIGGER synthetic_settlement_failure");
  assert.equal(
    (await f.post("/api/listening/qualify", { id, playedMs: 60000 })).status,
    200,
  );
  assert.equal(wallet(f.db, f.alice.user.id, f.now()).balanceUnits, 3750);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
    1,
  );
  const sum = f.db
    .prepare("SELECT sum(delta_units) AS n FROM credit_ledger WHERE user_id=?")
    .get(f.alice.user.id).n;
  assert.equal(sum, 3750);
});

test("qualifying duration follows observed media milliseconds without losing time to ordinary callback jitter", () => {
  const c = new QualifyingClock();
  c.sample({ position: 0, now: 0, active: true });
  for (let i = 1; i <= 60; i++)
    c.sample({ position: i, now: i * 1000 + (i % 2 ? 10 : 0), active: true });
  assert.equal(c.total, 60000);
});
