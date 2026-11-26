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
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./fixture.js";
import { png } from "./png.js";
import { openDatabase } from "../apps/server/database.js";
import {
  articleDocument,
  externalURL,
  utcTimestamp,
} from "../apps/web/editorial-format.js";
const paragraph = (text) => [{ type: "paragraph", children: [{ text }] }];
async function setup(t) {
  let time = Date.now();
  const f = await fixture(t, {}, { editorialNow: () => time });
  const admin = await f.login("artist"),
    alice = await f.login("alice");
  const call = async (path, data, auth = admin) => {
    const r = await f.request(path, data, auth);
    return { status: r.status, value: await r.json() };
  };
  const create = async (title) =>
    (
      await call("/api/admin/articles", {
        title,
        body: paragraph("Synthetic editorial text"),
      })
    ).value.article;
  const mutate = async (row, action, data = {}) =>
    call(`/api/admin/articles/${row.id}${action ? "/" + action : ""}`, {
      revision: row.revision,
      ...data,
    });
  const list = async () =>
    (await call("/api/blog", undefined, alice)).value.articles;
  return {
    ...f,
    admin,
    alice,
    call,
    create,
    mutate,
    list,
    tick: (ms) => (time += ms),
    time: () => time,
  };
}
test("article lifecycle uses first publication chronology, UTC display and content-only update timestamps", async (t) => {
  const f = await setup(t),
    draft = await f.create("Draft");
  assert.equal(draft.published_at, null);
  assert.equal(draft.updated_at, null);
  assert.equal(
    (await f.call(`/api/blog/${draft.id}`, undefined, f.alice)).status,
    404,
  );
  f.tick(86400000);
  let row = (
    await f.mutate(draft, "", {
      title: "Written title",
      body: paragraph("Updated draft"),
    })
  ).value.article;
  assert.equal(row.updated_at, null);
  row = (await f.mutate(row, "publish")).value.article;
  assert.equal(row.published_at, f.time());
  assert.equal(row.updated_at, row.published_at);
  const published = row.published_at;
  f.tick(1000);
  row = (await f.mutate(row, "prominence", { prominence: "pin" })).value
    .article;
  assert.equal(row.updated_at, published);
  row = (
    await f.mutate(row, "", {
      title: "Revised",
      body: paragraph("Later content"),
    })
  ).value.article;
  assert.equal(row.published_at, published);
  assert.equal(row.updated_at, f.time());
  const updated = row.updated_at;
  row = (await f.mutate(row, "unpublish")).value.article;
  assert.equal((await f.list()).length, 0);
  assert.equal(row.updated_at, updated);
  f.tick(10000);
  row = (await f.mutate(row, "publish")).value.article;
  assert.equal(row.published_at, published);
  assert.equal(row.updated_at, updated);
  assert.equal(row.prominence, "pin");
  const reader = (await f.call(`/api/blog/${row.id}`, undefined, f.alice)).value
    .article;
  assert.equal(reader.created_at, undefined);
  assert.equal(reader.status, undefined);
  assert.match(
    utcTimestamp(Date.UTC(2026, 10, 20, 18, 30)),
    /November 20, 2026.*18:30 UTC/,
  );
});
test("published ordering uses Top Pin, standard Pins and publication date with stable ties; editing never redates", async (t) => {
  const f = await setup(t);
  const oldDraft = await f.create("Created first");
  f.tick(10000);
  let newer = await f.create("Published first");
  newer = (await f.mutate(newer, "publish")).value.article;
  f.tick(10000);
  let latest = (await f.mutate(oldDraft, "publish")).value.article;
  assert.deepEqual(
    (await f.list()).map((r) => r.id),
    [latest.id, newer.id],
  );
  newer = (await f.mutate(newer, "prominence", { prominence: "pin" })).value
    .article;
  assert.equal((await f.list())[0].id, newer.id);
  latest = (await f.mutate(latest, "prominence", { prominence: "pin" })).value
    .article;
  assert.deepEqual(
    (await f.list()).map((r) => r.id),
    [latest.id, newer.id],
  );
  newer = (await f.mutate(newer, "prominence", { prominence: "top" })).value
    .article;
  assert.equal((await f.list())[0].id, newer.id);
  f.tick(10000);
  latest = (
    await f.mutate(latest, "", {
      title: "Revised old date",
      body: paragraph("Revised"),
    })
  ).value.article;
  assert.equal((await f.list())[0].id, newer.id);
  const tied = [];
  for (const title of ["Tie one", "Tie two"]) {
    let row = await f.create(title);
    row = (await f.mutate(row, "publish")).value.article;
    tied.push(row.id);
  }
  const normal = (await f.list()).filter((r) => r.prominence === "normal");
  assert.deepEqual(
    normal.map((r) => r.id),
    tied.sort().reverse(),
  );
});
test("Top Pin conflicts require an explicit choice and expected occupant; replacement/demotion is atomic, stale choices fail", async (t) => {
  const f = await setup(t);
  let a = await f.create("Existing top"),
    b = await f.create("Candidate");
  a = (await f.mutate(a, "publish")).value.article;
  b = (await f.mutate(b, "publish")).value.article;
  a = (await f.mutate(a, "prominence", { prominence: "top" })).value.article;
  const conflict = await f.mutate(b, "prominence", { prominence: "top" });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.value.topPin.id, a.id);
  assert.equal(
    f.db
      .prepare("SELECT count(*) AS n FROM articles WHERE prominence='top'")
      .get().n,
    1,
  );
  assert.equal(
    f.db.prepare("SELECT prominence FROM articles WHERE id=?").get(b.id)
      .prominence,
    "normal",
  );
  const standard = await f.mutate(b, "prominence", {
    prominence: "top",
    resolution: "pin",
    expectedTopId: a.id,
    expectedTopRevision: a.revision,
  });
  b = standard.value.article;
  assert.equal(b.prominence, "pin");
  assert.equal((await f.list())[0].id, a.id);
  const replace = await f.mutate(b, "prominence", {
    prominence: "top",
    resolution: "replace",
    expectedTopId: a.id,
    expectedTopRevision: a.revision,
  });
  b = replace.value.article;
  assert.equal(b.prominence, "top");
  assert.equal(
    f.db.prepare("SELECT prominence FROM articles WHERE id=?").get(a.id)
      .prominence,
    "pin",
  );
  assert.equal(
    (await f.mutate(b, "prominence", { prominence: "top" })).value.article
      .revision,
    b.revision,
  );
  assert.throws(
    () =>
      f.db.prepare("UPDATE articles SET prominence='top' WHERE id=?").run(a.id),
    /UNIQUE/,
  );
  b = (await f.mutate(b, "unpublish")).value.article;
  assert.equal(b.prominence, "pin");
  assert.equal(
    f.db
      .prepare("SELECT count(*) AS n FROM articles WHERE prominence='top'")
      .get().n,
    0,
  );
  a = (await f.call(`/api/admin/articles/${a.id}`)).value.article;
  a = (await f.mutate(a, "prominence", { prominence: "top" })).value.article;
  b = (await f.mutate(b, "publish")).value.article;
  assert.equal(b.prominence, "pin");
  assert.equal((await f.list())[0].id, a.id);
});
test("concurrent Top Pin assignment never silently replaces a winner; stale edits cannot overwrite content", async (t) => {
  const f = await setup(t);
  const rows = [];
  for (const title of ["One", "Two"]) {
    let r = await f.create(title);
    rows.push((await f.mutate(r, "publish")).value.article);
  }
  const results = await Promise.all(
    rows.map((r) => f.mutate(r, "prominence", { prominence: "top" })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    f.db
      .prepare("SELECT count(*) AS n FROM articles WHERE prominence='top'")
      .get().n,
    1,
  );
  const row = (await f.call(`/api/admin/articles/${rows[0].id}`)).value.article;
  await f.mutate(row, "", {
    title: "Saved change",
    body: paragraph("New text"),
  });
  assert.equal(
    (await f.mutate(row, "", { title: "Stale loss", body: paragraph("Stale") }))
      .status,
    409,
  );
});
test("private article images enforce authentication/publication, validate bytes/bounds and update only content timestamps", async (t) => {
  const f = await setup(t);
  let row = await f.create("Photo essay");
  const bytes = png(64, 64);
  const upload = async (auth, mime = "image/png", value = bytes) => {
    const r = await fetch(
      `http://127.0.0.1:${f.server.address().port}/api/admin/articles/${row.id}/images?revision=${row.revision}`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": mime,
          ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrf } : {}),
        },
        body: value,
      },
    );
    return { status: r.status, value: await r.json() };
  };
  assert.equal((await upload()).status, 401);
  assert.equal((await upload(f.alice)).status, 403);
  assert.equal(
    (await upload(f.admin, "image/svg+xml", Buffer.from("<svg/>"))).status,
    415,
  );
  assert.equal(
    (await upload(f.admin, "image/png", Buffer.from("not an image"))).status,
    400,
  );
  assert.equal(
    (await upload(f.admin, "image/png", Buffer.alloc(2 * 1024 * 1024 + 1)))
      .status,
    413,
  );
  row = (await upload(f.admin)).value.article;
  const image = row.images[0].id;
  assert.equal((await f.request(`/api/blog/images/${image}`)).status, 401);
  assert.equal(
    (await f.request(`/api/blog/images/${image}`, undefined, f.alice)).status,
    404,
  );
  assert.equal(
    (
      await f.request(`/api/blog/images/${image}`, undefined, f.admin)
    ).headers.get("cache-control"),
    "no-store",
  );
  row = (await f.mutate(row, "publish")).value.article;
  const published = row.published_at;
  f.tick(1000);
  row = (
    await f.call(`/api/admin/articles/${row.id}/images/${image}`, {
      revision: row.revision,
      alt: "Synthetic scene",
      caption: "Caption",
      position: 0,
    })
  ).value.article;
  assert.equal(row.updated_at, f.time());
  assert.equal(row.published_at, published);
  const response = await f.request(
    `/api/blog/images/${image}`,
    undefined,
    f.alice,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  row = (await f.mutate(row, "unpublish")).value.article;
  assert.equal(
    (await f.request(`/api/blog/images/${image}`, undefined, f.alice)).status,
    404,
  );
  row = (await f.mutate(row, "publish")).value.article;
  assert.equal((await f.mutate(row, "delete")).status, 200);
  assert.equal(
    (await f.request(`/api/blog/images/${image}`, undefined, f.admin)).status,
    404,
  );
});
test("social directory is private, ordered and enabled-only; edits/reordering/deletion reject unsafe URLs and stale versions", async (t) => {
  const f = await setup(t);
  assert.equal((await f.request("/api/social")).status, 401);
  assert.equal(
    (
      await f.call(
        "/api/admin/social",
        {
          label: "Bad",
          url: "https://example.com",
          platform: "generic",
          position: 0,
          enabled: true,
        },
        f.alice,
      )
    ).status,
    403,
  );
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//example.com",
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/\\evil",
    "https://example.com/with space",
  ])
    assert.throws(() => externalURL(url));
  for (const [label, url, position, enabled] of [
    ["Hidden", "https://example.com/private", 0, false],
    ["Second", "https://example.org/profile", 2, true],
    ["First", "https://example.net/profile", 1, true],
  ])
    assert.equal(
      (
        await f.call("/api/admin/social", {
          label,
          url,
          platform: "generic",
          position,
          enabled,
        })
      ).status,
      200,
    );
  assert.deepEqual(
    (await f.call("/api/social", undefined, f.alice)).value.links.map(
      (l) => l.label,
    ),
    ["First", "Second"],
  );
  let link = (await f.call("/api/admin/social")).value.links.find(
    (l) => l.label === "Second",
  );
  assert.equal(
    (
      await f.call(`/api/admin/social/${link.id}`, {
        ...link,
        label: "New label",
        enabled: true,
        position: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.call(`/api/admin/social/${link.id}`, { ...link, enabled: true }))
      .status,
    409,
  );
  link = (await f.call("/api/admin/social")).value.links.find(
    (l) => l.id === link.id,
  );
  assert.equal(
    (
      await f.call(`/api/admin/social/${link.id}/delete`, {
        revision: link.revision,
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.call("/api/social", undefined, f.alice)).value.links.length,
    1,
  );
  assert.equal(
    (
      await f.call("/api/admin/social", {
        label: "Internal",
        url: "https://example.net",
        platform: "unknown",
        position: 0,
        enabled: true,
      })
    ).status,
    400,
  );
});
test("formatted documents reject active/embedded content, lists and HTTPS links are canonical; editorial requests preserve accounting and CSRF boundaries", async (t) => {
  const f = await setup(t);
  for (const body of [
    [{ type: "html", html: "<script/>" }],
    [
      {
        type: "paragraph",
        children: [{ text: "x", href: "javascript:alert(1)" }],
      },
    ],
    [{ type: "audio", src: "x" }],
    [{ type: "paragraph", children: [{ text: "x", html: "<img/>" }] }],
  ])
    assert.throws(() => articleDocument(body));
  const blocks = articleDocument([
    { type: "heading", level: 2, children: [{ text: "Heading", bold: true }] },
    {
      type: "list",
      ordered: true,
      items: [
        [{ text: "Safe", italic: true, href: "https://example.net/profile" }],
      ],
    },
  ]);
  assert.equal(blocks[1].items[0][0].href, "https://example.net/profile");
  const before = {
    users: f.db.prepare("SELECT * FROM users ORDER BY id").all(),
    ledger: f.db.prepare("SELECT * FROM credit_ledger").all(),
    plays: f.db.prepare("SELECT * FROM qualifying_plays").all(),
    tracks: f.db.prepare("SELECT * FROM tracks ORDER BY id").all(),
  };
  let row = await f.create("<img src=x onerror=alert(1)>");
  assert.equal(
    (
      await f.request(
        `/api/admin/articles/${row.id}/publish`,
        { revision: row.revision },
        f.admin,
        { "X-CSRF-Token": "bad" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        "/api/admin/articles",
        { title: "Wrong origin" },
        f.admin,
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  row = (await f.mutate(row, "publish")).value.article;
  await f.list();
  await f.call(`/api/blog/${row.id}`, undefined, f.alice);
  await f.call("/api/social", undefined, f.alice);
  for (const [table, expected] of [
    ["users", before.users],
    ["credit_ledger", before.ledger],
    ["qualifying_plays", before.plays],
    ["tracks", before.tracks],
  ])
    assert.deepEqual(
      f.db
        .prepare(
          `SELECT * FROM ${table}${["users", "tracks"].includes(table) ? " ORDER BY id" : ""}`,
        )
        .all(),
      expected,
    );
});
test("blog pagination excludes full bodies and drafts; published order remains stable across equal dates", async (t) => {
  const f = await setup(t);
  for (let i = 0; i < 15; i++) {
    const row = await f.create("Article " + i);
    await f.mutate(row, "publish");
  }
  await f.create("Private draft");
  const first = (await f.call("/api/blog", undefined, f.alice)).value;
  assert.equal(first.articles.length, 12);
  assert.equal(first.nextOffset, 12);
  assert.equal(first.articles[0].body, undefined);
  assert.equal(first.articles[0].created_at, undefined);
  const next = (await f.call("/api/blog?offset=12", undefined, f.alice)).value;
  assert.equal(next.articles.length, 3);
  assert.equal(
    new Set([...first.articles, ...next.articles].map((r) => r.id)).size,
    15,
  );
  assert.equal(next.nextOffset, null);
  assert.equal(
    (await f.call("/api/blog?offset=-1", undefined, f.alice)).status,
    400,
  );
});
test("schema-6 migration is additive, atomic and repeatable, preserving all existing rows and media including credit ledger", async (t) => {
  const f = await setup(t);
  await f.call("/api/admin/listening/listener", {
    userId: f.alice.user.id,
    requestId: crypto.randomUUID(),
    amount: "2.125",
    unlimited: true,
    reason: "Synthetic preserved grant",
  });
  f.db.exec(
    "DROP TABLE article_images;DROP TABLE articles;DROP TABLE social_links;DELETE FROM schema_version WHERE version=7;",
  );
  const tables = f.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((t) => t.name),
    snapshot = () =>
      Object.fromEntries(
        tables.map((name) => [
          name,
          f.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(),
        ]),
      );
  const before = snapshot();
  const media = Object.fromEntries(
    readdirSync(join(f.directory, "media")).map((name) => [
      name,
      readFileSync(join(f.directory, "media", name)),
    ]),
  );
  f.db.exec("CREATE TABLE social_links(conflict TEXT)");
  assert.throws(() => openDatabase(f.directory), /already exists/);
  assert.equal(
    f.db.prepare("SELECT max(version) AS v FROM schema_version").get().v,
    6,
  );
  assert.equal(
    f.db.prepare("SELECT name FROM sqlite_master WHERE name='articles'").get(),
    undefined,
  );
  assert.deepEqual(snapshot(), before);
  f.db.exec("DROP TABLE social_links");
  for (let i = 0; i < 3; i++) {
    const db = openDatabase(f.directory);
    assert.equal(
      db.prepare("SELECT max(version) AS v FROM schema_version").get().v,
      7,
    );
    db.close();
    const after = snapshot();
    for (const table of tables.filter((t) => t !== "schema_version"))
      assert.deepEqual(after[table], before[table]);
  }
  for (const [name, bytes] of Object.entries(media))
    assert.deepEqual(readFileSync(join(f.directory, "media", name)), bytes);
});
