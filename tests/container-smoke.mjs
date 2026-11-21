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
// Development-only integration check: uses fresh synthetic volumes and loopback, never a deployment.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { png } from "./png.js";
const name = `artist-redesign-smoke-${Date.now()}`,
  volume = `${name}-data`;
const docker = (args, options = {}) =>
  execFileSync("docker", args, { encoding: "utf8", ...options });
const origin = "http://localhost:3000";
let base;
async function ready() {
  base =
    "http://127.0.0.1:" +
    docker(["port", name, "3000/tcp"]).trim().split(":").at(-1);
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) {
        const health = await r.json();
        assert.equal(health.schema, 5);
        assert.equal(health.version, "0.3.0");
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Container did not become healthy");
}
async function request(path, { auth, data, raw, mime } = {}) {
  const response = await fetch(base + path, {
    method: data !== undefined || raw ? "POST" : "GET",
    headers: {
      Origin: origin,
      "Content-Type": mime || "application/json",
      ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrf } : {}),
    },
    body: raw || (data === undefined ? undefined : JSON.stringify(data)),
  });
  return response;
}
async function json(path, options) {
  const res = await request(path, options);
  assert.ok(res.ok, `${path}: ${res.status} ${await res.clone().text()}`);
  return res.json();
}
async function login(username) {
  const response = await request("/api/login", {
    data: { username, password: "synthetic container passphrase" },
  });
  assert.equal(response.status, 200);
  return {
    ...(await response.json()),
    cookie: response.headers.get("set-cookie").split(";")[0],
  };
}
try {
  docker(["volume", "create", volume]);
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--tmpfs",
    "/tmp:size=16m,mode=1777",
    "-e",
    "NODE_ENV=development",
    "-e",
    `APP_ORIGIN=${origin}`,
    "-e",
    "DIAGNOSTICS_ALLOWED=true",
    "-v",
    `${volume}:/data`,
    "-p",
    "127.0.0.1::3000",
    "musixene-artist-platform:test",
  ]);
  await ready();
  assert.equal(
    docker(["exec", name, "node", "-p", "process.getuid()"]).trim(),
    "1000",
  );
  docker([
    "exec",
    name,
    "sh",
    "-c",
    "test -s /app/LICENSE && test -s /app/NOTICE && test -s /app/CHANGES.md",
  ]);
  docker(["exec", name, "node", "scripts/generate-demo.js"]);
  for (const [username, role] of [
    ["smoke-admin", "administrator"],
    ["smoke-listener", "listener"],
  ])
    docker(
      ["exec", "-i", name, "node", "scripts/manage-user.js", username, role],
      { input: "synthetic container passphrase" },
    );
  const admin = await login("smoke-admin"),
    listener = await login("smoke-listener");
  const initial = await json("/api/catalog", { auth: listener }),
    first = initial.tracks[0],
    hidden = initial.tracks[2];
  assert.equal(initial.tracks.length, 3);
  await json("/api/admin/settings", {
    auth: admin,
    data: {
      name: "Synthetic Container Artist",
      tagline: "",
      pwaName: "Synthetic Container Player",
      pwaShortName: "Container",
      accent: "#223355",
      registration: false,
    },
  });
  const icon = png(512, 512);
  await json("/api/admin/branding/icon512", {
    auth: admin,
    raw: icon,
    mime: "image/png",
  });
  await json(`/api/admin/tracks/${first.id}`, {
    auth: admin,
    data: {
      title: first.title,
      artist: first.artist,
      visible: true,
      position: 0,
      release_status: "published",
      explicit_status: "non_explicit",
      content_type: "music",
      genres: ["Soul"],
      tags: ["Driving"],
    },
  });
  const dynamic = await json("/api/admin/collections", {
    auth: admin,
    data: {
      title: "Synthetic dynamic catalog",
      visible: true,
      position: 0,
      kind: "dynamic",
      rules: {
        explicit_status: "non_explicit",
        genres_any: ["soul"],
        tags_any: ["driving"],
      },
    },
  });
  await json(`/api/feedback/tracks/${first.id}/like`, {
    auth: listener,
    data: { liked: true },
  });
  await json(`/api/feedback/tracks/${first.id}/notes`, {
    auth: listener,
    data: { body: "Synthetic private container note", requestId: randomUUID() },
  });
  const audio = await fetch(base + `/api/tracks/${first.id}/audio`, {
    headers: { Cookie: listener.cookie, Range: "bytes=44-99" },
  });
  assert.equal(audio.status, 206);
  const bytes = Buffer.from(await audio.arrayBuffer());
  assert.equal(bytes.length, 56);
  await json(`/api/admin/tracks/${hidden.id}`, {
    auth: admin,
    data: {
      title: hidden.title,
      artist: hidden.artist,
      visible: false,
      position: 9,
      release_status: "published",
    },
  });
  const denied = await request(`/api/tracks/${hidden.id}/audio`, {
    auth: listener,
  });
  assert.equal(denied.status, 404);
  await denied.arrayBuffer();
  const before = await json("/api/catalog", { auth: listener });
  assert.equal(before.tracks.length, 2);
  assert.deepEqual(before.catalogs.find((c) => c.id === dynamic.id).trackIds, [
    first.id,
  ]);
  const diagnosticBase = "/api/admin/diagnostics";
  const context = await json(diagnosticBase + "/settings", {
    auth: admin,
    data: { enabled: true, retentionDays: 7 },
  });
  const recordingId = randomUUID(),
    startedAt = Date.now();
  await json(diagnosticBase + "/recordings", {
    auth: admin,
    data: { recordingId, startedAt },
  });
  const report = {
    reportVersion: 1,
    recordingId,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    reason: "manual_stop",
    applicationVersion: "0.3.0",
    browser: { name: "Synthetic", os: "Other", mode: "Browser" },
    droppedEvents: 0,
    events: [
      {
        timestamp: new Date(startedAt).toISOString(),
        elapsedMs: 0,
        sequence: 1,
        category: "lifecycle",
        event: "recording-stopped",
        visibility: "visible",
      },
    ],
  };
  const receipt = await json(diagnosticBase + "/reports", {
    auth: admin,
    data: {
      recordingId,
      sessionContext: context.sessionContext,
      installationId: context.installationId,
      report,
    },
  });
  assert.equal(receipt.saved, true);
  assert.equal(
    (
      await request(diagnosticBase + "/reports/" + recordingId, {
        auth: listener,
      })
    ).status,
    403,
  );
  docker(["restart", name]);
  await ready();
  assert.deepEqual(
    await json(diagnosticBase + "/reports/" + recordingId, { auth: admin }),
    report,
  );
  const restored = await json("/api/catalog", { auth: listener });
  assert.equal(restored.tracks.length, 2);
  assert.equal(restored.tracks.find((t) => t.id === first.id).liked, 1);
  assert.deepEqual(
    restored.catalogs.find((c) => c.id === dynamic.id).trackIds,
    [first.id],
  );
  const feedback = await json("/api/feedback/history", { auth: listener });
  assert.equal(feedback.notes[0].body, "Synthetic private container note");
  const manifest = await json("/manifest.webmanifest");
  assert.equal(manifest.name, "Synthetic Container Player");
  assert.equal(manifest.icons.length, 1);
  assert.equal(manifest.icons[0].sizes, "512x512");
  const asset = await request(manifest.icons[0].src);
  assert.equal(asset.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), icon);
  const after = await fetch(base + `/api/tracks/${first.id}/audio`, {
    headers: { Cookie: listener.cookie, Range: "bytes=44-99" },
  });
  assert.equal(after.status, 206);
  assert.deepEqual(Buffer.from(await after.arrayBuffer()), bytes);
  console.log(
    "Container smoke passed: version 0.3.0/schema 5, non-root/read-only, private range playback, metadata/dynamic catalog, branding, feedback, private diagnostics and restart persistence.",
  );
} finally {
  try {
    docker(["rm", "-f", name]);
  } catch {}
  try {
    docker(["volume", "rm", volume]);
  } catch {}
}
