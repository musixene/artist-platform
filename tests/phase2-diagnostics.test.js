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
import { readFileSync } from "node:fs";
import {
  resourceDetails,
  mediaDetails,
  probeDetails,
  mediaPath,
  responseEvidence,
  safeError,
  validateReport,
} from "../apps/web/diagnostic-format.js";
import { fixture } from "./fixture.js";
const trackId = "00000000-0000-4000-8000-000000000002",
  documentId = "00000000-0000-4000-8000-000000000003";
function resource(status) {
  return resourceDetails({
    id: randomUUID(),
    documentId,
    trackId,
    path: `/api/tracks/${trackId}/audio?token=secret`,
    initiatorType: "audio",
    startTime: 12,
    responseEnd: 25,
    duration: 13,
    responseStatus: status,
    sourceGeneration: 1,
    purpose: "original_media",
    transferSize: 301,
    encodedBodySize: 1,
    decodedBodySize: 1,
    protocol: "h2",
    timeOrigin: 1000,
  });
}
function report(status) {
  const entry = resource(status);
  return {
    reportVersion: 2,
    recordingId: randomUUID(),
    startedAt: "2026-11-21T04:55:00.000Z",
    endedAt: "2026-11-21T04:55:01.000Z",
    durationMs: 1000,
    reason: "manual_stop",
    applicationVersion: "0.3.1",
    browser: { name: "Synthetic", os: "Android", mode: "Browser" },
    events: [
      {
        timestamp: "2026-11-21T04:55:00.030Z",
        elapsedMs: 30,
        sequence: 1,
        category: "playback",
        event: "audio-error",
        visibility: "hidden",
        trackId,
        documentId,
        media: {
          failedTrackId: trackId,
          sourceGeneration: 1,
          sourceStartTime: 10,
          snapshotAt: 26,
          readyState: 0,
          networkState: 3,
          durationSeconds: null,
          resources: [entry],
          mediaError: { name: "MediaError", message: "Format error" },
        },
      },
    ],
  };
}
test("report v2 distinguishes original candidate HTTP cases without claiming a codec cause or promoting a probe", () => {
  for (const [status, expected, evidence] of [
    [200, "D", "http_success"],
    [206, "D", "http_success"],
    [401, "A", "http_auth_failure"],
    [403, "A", "http_auth_failure"],
    [404, "B", "http_unavailable"],
    [416, "C", "http_range_failure"],
    [500, "B", "http_server_error"],
    [0, "E", "inconclusive"],
    [undefined, "E", "inconclusive"],
  ]) {
    assert.equal(responseEvidence(status), evidence);
    const value = validateReport(report(status));
    assert.deepEqual(value.mediaAnalysis[0].cases, [expected]);
    assert.equal(value.mediaAnalysis[0].conclusiveCause, false);
    assert.equal(
      value.events[0].media.resources[0].statusAvailability,
      status === undefined
        ? "unavailable"
        : status === 0
          ? "zero"
          : "available",
    );
  }
  const value = report(401);
  value.events[0].media.resources[0].purpose = "subsequent_foreground_probe";
  assert.deepEqual(validateReport(value).mediaAnalysis[0].cases, ["E"]);
  value.events[0].media.resources[0].purpose = "original_media";
  value.events[0].media.resources[0].sourceGeneration = 2;
  assert.deepEqual(validateReport(value).mediaAnalysis[0].cases, ["E"]);
});
test("format v2 removes sensitive URLs/headers/nested values, bounds ranges and timing data, and preserves unknown duration", () => {
  const path = `/api/tracks/${trackId}/audio`;
  assert.equal(mediaPath(path + "?token=private#fragment"), path);
  assert.equal(mediaPath("https://untrusted.invalid" + path), null);
  assert.equal(mediaPath("https://user:pass@diagnostic.invalid" + path), null);
  const media = mediaDetails({
    currentSourcePath: path + "?password=secret",
    expectedPath: path,
    buffered: Array(20).fill([0, 3]),
    seekable: [
      [0, 8],
      [-1, 9],
      [0, Infinity],
    ],
    durationSeconds: null,
    resources: [
      { ...resource(401), Cookie: "private cookie", authorization: "secret" },
    ],
    note: "private note",
    mediaError: {
      name: "MediaError",
      message: "Failed https://example.invalid/private?token=secret",
    },
  });
  assert.equal(media.buffered.length, 8);
  assert.deepEqual(media.seekable, [[0, 8]]);
  assert.equal(media.durationSeconds, null);
  assert.equal(media.currentSourcePath, path);
  assert.doesNotMatch(
    JSON.stringify(media),
    /private|password|cookie|authorization|example/,
  );
  const probe = probeDetails({
    status: 206,
    path,
    contentType: "audio/mpeg",
    contentRange: "bytes 0-0/100",
    contentLength: "1",
    acceptRanges: "bytes",
    contentEncoding: "identity",
    Cookie: "secret",
    body: "music content",
    bodyRead: false,
  });
  assert.equal(probe.contentRange, "bytes 0-0/100");
  assert.equal(probe.kind, "subsequent_foreground_probe");
  assert.equal(probe.bodyRead, false);
  assert.doesNotMatch(JSON.stringify(probe), /secret|music content/);
});
test("multiple ranges remain independent and late observer delivery can correlate by original source times", () => {
  const value = report(206),
    first = value.events[0].media.resources[0],
    second = { ...resource(401), startTime: 20, responseEnd: 40 };
  value.events[0].media.resources.push(second);
  value.events.push({
    timestamp: "2026-11-21T04:55:00.050Z",
    elapsedMs: 50,
    sequence: 2,
    category: "network",
    event: "audio-resource-timing",
    visibility: "hidden",
    documentId,
    resource: second,
  });
  const analysis = validateReport(value).mediaAnalysis[0];
  assert.deepEqual(analysis.observedStatuses, [401, 206]);
  assert.equal(analysis.candidateResourceIds.length, 2);
  assert.deepEqual(new Set(analysis.cases), new Set(["A", "D"]));
  assert.notEqual(first.id, second.id);
});
test("v2 upload persists canonical analysis with owner/privacy/duplicate rules and legacy v1 remains accepted", async (t) => {
  const f = await fixture(t, { DIAGNOSTICS_ALLOWED: "true" }),
    admin = await f.login("artist"),
    base = "/api/admin/diagnostics";
  const ctx = await (
    await f.request(
      base + "/settings",
      { enabled: true, retentionDays: 7 },
      admin,
    )
  ).json();
  const value = report(401),
    startedAt = Date.now();
  value.startedAt = new Date(startedAt).toISOString();
  await f.request(
    base + "/recordings",
    { recordingId: value.recordingId, startedAt },
    admin,
  );
  const payload = {
    recordingId: value.recordingId,
    sessionContext: ctx.sessionContext,
    installationId: ctx.installationId,
    report: value,
  };
  assert.equal(
    (await f.request(base + "/reports", payload, admin)).status,
    201,
  );
  assert.equal(
    (await f.request(base + "/reports", payload, admin)).status,
    200,
  );
  const saved = await (
    await f.request(base + "/reports/" + value.recordingId, undefined, admin)
  ).json();
  assert.equal(saved.reportVersion, 2);
  assert.deepEqual(saved.mediaAnalysis[0].cases, ["A"]);
  const history = await (
    await f.request(base + "/reports", undefined, admin)
  ).json();
  assert.equal(history.reports[0].reportVersion, 2);
  const legacy = JSON.parse(
    readFileSync(
      new URL("./fixtures/diagnostic-report.example.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(validateReport(legacy).reportVersion, 1);
  assert.equal(validateReport(legacy).mediaAnalysis, undefined);
});

test("probe header states distinguish absent and malformed headers without retaining secrets", () => {
  const value = probeDetails({
    status: 500,
    contentType: "text/plain; charset=utf-8",
    contentLength: "secret=private",
    contentRange: "bad range with token",
    contentEncoding: "gzip, br",
  });
  assert.equal(value.contentType, "text/plain; charset=utf-8");
  assert.equal(value.headerStates.contentLength, "redacted");
  assert.equal(value.headerStates.contentRange, "redacted");
  assert.equal(value.headerStates.acceptRanges, "missing");
  assert.equal(value.contentEncoding, "gzip, br");
  assert.doesNotMatch(JSON.stringify(value), /private|token/);
  assert.deepEqual(probeDetails(value), value);
});
test("v2 summary is bounded and canonical sample identifies original HTTP failure separately from foreground success", () => {
  const sample = validateReport(
    JSON.parse(
      readFileSync(
        new URL("./fixtures/media-http-failure.example.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  assert.equal(sample.reportVersion, 2);
  assert.deepEqual(sample.mediaAnalysis[0].cases, ["A"]);
  assert.equal(sample.events.at(-1).probe.status, 206);
  const value = report(401);
  value.events.push(
    ...Array.from({ length: 100 }, (_, i) => ({
      timestamp: "2026-11-21T04:55:00.050Z",
      elapsedMs: 50,
      sequence: i + 2,
      category: "network",
      event: "audio-resource-timing",
      visibility: "hidden",
      documentId,
      resource: {
        ...resource(206),
        startTime: 12 + i / 1000,
        responseEnd: 25 + i / 1000,
      },
    })),
  );
  const analysis = validateReport(value).mediaAnalysis[0];
  assert.equal(analysis.candidateResourceIds.length, 32);
  assert.ok(analysis.omittedCandidateCount > 0);
  assert.deepEqual(new Set(analysis.cases), new Set(["A", "D"]));
});

test("format 2 redacts relative URL queries/fragments while legacy format-1 canonicalization stays stable", () => {
  const error = {
    name: "NotSupportedError",
    message:
      "Failed /api/tracks/00000000-0000-4000-8000-000000000002/audio?signature=synthetic-private",
  };
  assert.doesNotMatch(safeError(error).message, /signature|synthetic-private/);
  assert.equal(
    safeError(error, 1).message,
    "Failed [redacted]?signature=synthetic-private",
  );
});
