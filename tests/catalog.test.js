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
import { fixture } from "./fixture.js";

test("system views include unassigned tracks once, preserve release/access separation and enforce role validation", async (t) => {
  const f = await fixture(t),
    admin = await f.login("artist"),
    listener = await f.login("alice");
  const get = async () => {
    const response = await f.request("/api/catalog", undefined, listener);
    assert.equal(response.status, 200);
    return response.json();
  };
  const defaults = await get();
  assert.equal(defaults.tracks.length, 3);
  assert.ok(
    defaults.tracks.every(
      (t) =>
        t.explicit_status === "unreviewed" &&
        t.release_status === "unpublished" &&
        t.content_type === "other",
    ),
  );
  assert.deepEqual(
    defaults.catalogs.map((c) => c.title),
    ["All Catalogs", "All Published Works", "All Unpublished Works"],
  );
  const edit = (track, changes, auth = admin) =>
    f.request(
      `/api/admin/tracks/${track.id}`,
      {
        title: track.title,
        artist: track.artist,
        position: 0,
        visible: true,
        ...changes,
      },
      auth,
    );
  assert.equal(
    (await edit(f.tracks[0], { release_status: "published" }, listener)).status,
    403,
  );
  for (const changes of [
    { release_status: "private" },
    { explicit_status: "clean" },
    { content_type: "bad type" },
    { genres: ["x".repeat(51)] },
    { tags: Array(21).fill("tag") },
    { genres: "Funk" },
  ])
    assert.equal((await edit(f.tracks[0], changes)).status, 400);
  await edit(f.tracks[0], {
    release_status: "published",
    explicit_status: "explicit",
    content_type: "music",
    genres: ["Soul", "soul", "Funk"],
    tags: ["Driving"],
  });
  await edit(f.tracks[1], { visible: false, release_status: "published" });
  const saved = await get();
  assert.deepEqual(
    saved.catalogs[0].trackIds.sort(),
    [f.tracks[0].id, f.tracks[2].id].sort(),
  );
  assert.deepEqual(saved.catalogs[1].trackIds, [f.tracks[0].id]);
  assert.deepEqual(saved.catalogs[2].trackIds, [f.tracks[2].id]);
  assert.deepEqual(saved.tracks.find((t) => t.id === f.tracks[0].id).genres, [
    "Soul",
    "Funk",
  ]);
  assert.equal(
    (
      await f.request(
        `/api/tracks/${f.tracks[1].id}/audio`,
        undefined,
        listener,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request(
        `/api/tracks/${f.tracks[1].id}/artwork`,
        undefined,
        listener,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request(
        `/api/tracks/${f.tracks[2].id}/audio`,
        undefined,
        listener,
      )
    ).status,
    200,
  );
  assert.equal((await f.request("/api/catalog")).status, 401);
});

test("curated ordering and dynamic filters use visible metadata and update automatically", async (t) => {
  const f = await fixture(t),
    admin = await f.login("artist"),
    listener = await f.login("alice");
  const edit = (track, changes) =>
    f.request(
      `/api/admin/tracks/${track.id}`,
      {
        title: track.title,
        artist: track.artist,
        position: 0,
        visible: true,
        ...changes,
      },
      admin,
    );
  await edit(f.tracks[0], {
    release_status: "unpublished",
    explicit_status: "non_explicit",
    content_type: "music",
    genres: ["Soul"],
    tags: ["Driving"],
  });
  await edit(f.tracks[1], {
    release_status: "published",
    explicit_status: "unreviewed",
    content_type: "interview",
    genres: ["Funk"],
    tags: ["Classic"],
  });
  await edit(f.tracks[2], {
    visible: false,
    explicit_status: "non_explicit",
    content_type: "music",
    genres: ["Soul"],
    tags: ["Driving"],
  });
  async function create(data) {
    const response = await f.request(
      "/api/admin/collections",
      {
        title: "Synthetic catalog",
        visible: true,
        position: 0,
        trackIds: [],
        ...data,
      },
      admin,
    );
    assert.equal(response.status, 200);
    return (await response.json()).id;
  }
  const curated = await create({
    trackIds: [f.tracks[1].id, f.tracks[0].id, f.tracks[2].id],
  });
  await create({ trackIds: [f.tracks[0].id] });
  const dynamic = await create({
    kind: "dynamic",
    rules: {
      explicit_status: "non_explicit",
      content_type: "music",
      genres_any: ["soul", "Jazz"],
      tags_any: ["driving"],
    },
  });
  const interviews = await create({
    kind: "dynamic",
    title: "Interviews",
    rules: { content_type: "interview" },
  });
  const privateCatalog = await create({
    kind: "dynamic",
    visible: false,
    rules: { release_status: "published" },
  });
  for (const rules of [
    {},
    { query: "1=1" },
    { explicit_status: "clean" },
    { genres_any: "Soul" },
    { content_type: "bad query" },
  ])
    assert.equal(
      (
        await f.request(
          "/api/admin/collections",
          {
            title: "Invalid",
            kind: "dynamic",
            visible: true,
            position: 0,
            rules,
          },
          admin,
        )
      ).status,
      400,
    );
  let data = await (
    await f.request("/api/catalog", undefined, listener)
  ).json();
  assert.equal(new Set(data.catalogs[0].trackIds).size, 2);
  assert.deepEqual(data.catalogs.find((c) => c.id === curated).trackIds, [
    f.tracks[1].id,
    f.tracks[0].id,
  ]);
  assert.deepEqual(data.catalogs.find((c) => c.id === dynamic).trackIds, [
    f.tracks[0].id,
  ]);
  assert.deepEqual(data.catalogs.find((c) => c.id === interviews).trackIds, [
    f.tracks[1].id,
  ]);
  assert.equal(
    data.catalogs.some((c) => c.id === privateCatalog),
    false,
  );
  await edit(f.tracks[1], {
    explicit_status: "non_explicit",
    content_type: "music",
    genres: ["Soul"],
    tags: ["Driving"],
    position: 9,
  });
  data = await (await f.request("/api/catalog", undefined, listener)).json();
  assert.deepEqual(data.catalogs.find((c) => c.id === dynamic).trackIds, [
    f.tracks[0].id,
    f.tracks[1].id,
  ]);
  assert.deepEqual(data.catalogs.find((c) => c.id === interviews).trackIds, []);
  const legacy = await (
    await f.request("/api/collections", undefined, listener)
  ).json();
  assert.equal(
    legacy.collections.find((c) => c.id === dynamic).tracks.length,
    2,
  );
  const state = await (
    await f.request("/api/admin/state", undefined, admin)
  ).json();
  assert.equal(
    state.collections.find((c) => c.id === privateCatalog).kind,
    "dynamic",
  );
  assert.deepEqual(state.tracks.find((t) => t.id === f.tracks[0].id).tags, [
    "Driving",
  ]);
});
