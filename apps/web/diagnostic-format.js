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
// Only these fields cross the recorder boundary. No URLs, bodies, credentials or note text.
export const LIMITS = Object.freeze({
  bytes: 1048576,
  eventBytes: 851968, // Reserve 192 KiB for bounded format-2 analysis/metadata.
  events: 4000,
  durationMs: 86400000,
  uploadMs: 8000,
});
export const CATEGORIES = [
  "playback",
  "media_session",
  "lifecycle",
  "authentication",
  "network",
  "application",
];
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function safeError(error, version = 2) {
  const name = /^[A-Za-z]{1,60}(Error|Exception)$/.test(error?.name || "")
    ? error.name
    : "Error";
  let message = String(error?.message || "")
    .slice(0, 400)
    .replace(/(?:https?|file|blob|data):[^\s]+/gi, "[URL]")
    .replace(/[\w.+-]+@[\w.-]+/g, "[address]")
    .replace(
      /(?:password|cookie|authorization|token|csrf|secret)\s*[:=]\s*[^,;\n]+/gi,
      "[redacted]",
    );
  if (version === 2)
    message = message.replace(/\/[^\s"'<>]*[?#][^\s"'<>]*/g, "[URL]");
  message = message.replace(/[A-Za-z0-9_+/=-]{32,}/g, "[redacted]");
  return { name, message };
}
const numeric = [
  "positionSeconds",
  "durationSeconds",
  "readyState",
  "networkState",
  "queueLength",
  "queueIndex",
  "gapMs",
  "sinceVisibleMs",
  "status",
  "mediaErrorCode",
];
const flags = ["paused", "ended", "seeking", "shuffle", "persisted", "online"];
export function details(value = {}, version = 2) {
  const result = {};
  for (const key of numeric)
    if (Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1e12)
      result[key] = value[key];
  for (const key of flags)
    if (typeof value[key] === "boolean") result[key] = value[key];
  for (const key of ["trackId", "nextTrackId", "documentId"])
    if (typeof value[key] === "string" && UUID.test(value[key]))
      result[key] = value[key];
  if (["off", "one", "all"].includes(value.repeat))
    result.repeat = value.repeat;
  if (
    ["active", "hidden", "frozen", "restored", "navigating"].includes(
      value.lifecycle,
    )
  )
    result.lifecycle = value.lifecycle;
  if (value.error) result.error = safeError(value.error, version);
  if (version === 2) {
    if (value.resource) result.resource = resourceDetails(value.resource);
    if (value.media) result.media = mediaDetails(value.media);
    if (value.probe) result.probe = probeDetails(value.probe);
  }
  return result;
}
export function validateReport(input) {
  const bad = () => {
    throw new Error("Invalid diagnostic report");
  };
  if (
    !input ||
    ![1, 2].includes(input.reportVersion) ||
    typeof input.recordingId !== "string" ||
    !UUID.test(input.recordingId) ||
    !Array.isArray(input.events) ||
    input.events.length < 1 ||
    input.events.length > LIMITS.events
  )
    bad();
  if (
    ![
      "manual_stop",
      "logout",
      "policy_revoked",
      "duration_limit",
      "storage_failure",
    ].includes(input.reason)
  )
    bad();
  if (
    !Number.isFinite(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > LIMITS.durationMs
  )
    bad();
  for (const key of ["startedAt", "endedAt"])
    if (
      typeof input[key] !== "string" ||
      input[key].length > 40 ||
      !Number.isFinite(Date.parse(input[key]))
    )
      bad();
  if (
    typeof input.applicationVersion !== "string" ||
    input.applicationVersion.length > 40 ||
    !/^\d+\.\d+\.\d+(?:[-.a-z0-9]*)?$/.test(input.applicationVersion)
  )
    bad();
  let sequence = 0,
    elapsed = 0;
  const events = input.events.map((e) => {
    if (
      !Number.isSafeInteger(e.sequence) ||
      e.sequence <= sequence ||
      !Number.isFinite(e.elapsedMs) ||
      e.elapsedMs < elapsed ||
      e.elapsedMs > input.durationMs ||
      typeof e.timestamp !== "string" ||
      e.timestamp.length > 40 ||
      !Number.isFinite(Date.parse(e.timestamp)) ||
      !CATEGORIES.includes(e.category) ||
      typeof e.event !== "string" ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(e.event) ||
      !["visible", "hidden"].includes(e.visibility)
    )
      bad();
    sequence = e.sequence;
    elapsed = e.elapsedMs;
    const projected = {
      timestamp: e.timestamp,
      elapsedMs: e.elapsedMs,
      sequence: e.sequence,
      category: e.category,
      event: e.event,
      visibility: e.visibility,
      ...details(e, input.reportVersion),
    };
    // Reject unexpected fields rather than retaining arbitrary client data.
    if (Object.keys(e).some((key) => !(key in projected))) bad();
    return projected;
  });
  const browser = {};
  for (const key of ["name", "version", "os", "mode"]) {
    const value = input.browser?.[key];
    if (typeof value === "string" && /^[a-zA-Z0-9 ._-]{1,60}$/.test(value))
      browser[key] = value;
  }
  const result = {
    reportVersion: input.reportVersion,
    recordingId: input.recordingId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: input.durationMs,
    reason: input.reason,
    applicationVersion: input.applicationVersion,
    browser,
    droppedEvents:
      Number.isSafeInteger(input.droppedEvents) && input.droppedEvents >= 0
        ? input.droppedEvents
        : 0,
    events,
  };
  if (input.reportVersion === 2) result.mediaAnalysis = analyzeMedia(events);
  return result;
}

// Only same-origin canonical audio paths survive; query/fragment/credentials never do.
export function mediaPath(value, origin = "https://diagnostic.invalid") {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value, origin);
    return url.origin === origin &&
      !url.username &&
      !url.password &&
      /^\/api\/tracks\/[a-f0-9-]{36}\/audio$/.test(url.pathname) &&
      UUID.test(url.pathname.split("/")[3])
      ? url.pathname
      : null;
  } catch {
    return null;
  }
}
const numbers = (input, keys) =>
  Object.fromEntries(
    keys
      .filter(
        (k) => Number.isFinite(input?.[k]) && input[k] >= 0 && input[k] <= 1e15,
      )
      .map((k) => [k, input[k]]),
  );
const booleans = (input, keys) =>
  Object.fromEntries(
    keys
      .filter((k) => typeof input?.[k] === "boolean")
      .map((k) => [k, input[k]]),
  );
const identifiers = (input, keys) =>
  Object.fromEntries(
    keys
      .filter((k) => typeof input?.[k] === "string" && UUID.test(input[k]))
      .map((k) => [k, input[k]]),
  );
export function responseEvidence(status) {
  if (!Number.isInteger(status) || status <= 0) return "inconclusive";
  if (status === 401 || status === 403) return "http_auth_failure";
  if (status === 416) return "http_range_failure";
  if (status === 404) return "http_unavailable";
  if (status === 200 || status === 206) return "http_success";
  if (status >= 500) return "http_server_error";
  return "http_unexpected";
}
export function resourceDetails(input = {}) {
  const result = {
    ...identifiers(input, ["id", "documentId", "trackId"]),
    ...numbers(input, [
      "timeOrigin",
      "startTime",
      "requestStart",
      "responseStart",
      "responseEnd",
      "duration",
      "transferSize",
      "encodedBodySize",
      "decodedBodySize",
      "sourceGeneration",
    ]),
  };
  const path = mediaPath(input.path);
  if (path) result.path = path;
  if (
    ["audio", "video", "fetch", "other", "xmlhttprequest", ""].includes(
      input.initiatorType,
    )
  )
    result.initiatorType = input.initiatorType;
  if (
    typeof input.protocol === "string" &&
    /^[a-zA-Z0-9./_-]{0,24}$/.test(input.protocol)
  )
    result.protocol = input.protocol;
  const status = input.responseStatus;
  if (Number.isInteger(status) && status >= 0 && status <= 599)
    result.responseStatus = status;
  result.statusAvailability =
    result.responseStatus === 0
      ? "zero"
      : result.responseStatus === undefined
        ? "unavailable"
        : "available";
  result.evidence = responseEvidence(result.responseStatus);
  result.kind = "passive_resource_timing";
  result.purpose = [
    "original_media",
    "subsequent_foreground_probe",
    "unclassified",
  ].includes(input.purpose)
    ? input.purpose
    : "unclassified";
  return result;
}
function ranges(value) {
  return Array.isArray(value)
    ? value
        .slice(0, 8)
        .filter(
          (r) =>
            Array.isArray(r) &&
            r.length === 2 &&
            r.every((n) => Number.isFinite(n) && n >= 0 && n <= 1e12) &&
            r[1] >= r[0],
        )
    : [];
}
const MIME = /^audio\/[a-z0-9.+-]{1,60}$/i;
export function mediaDetails(input = {}) {
  const result = {
    ...numbers(input, [
      "sourceGeneration",
      "playOperationId",
      "sourceGenerationAtRequest",
      "playOperationIdAtRequest",
      "operationStartedAt",
      "sourceStartTime",
      "snapshotAt",
      "timeOrigin",
      "positionSeconds",
      "durationSeconds",
      "readyState",
      "networkState",
      "mediaErrorCode",
      "sinceVisibleMs",
    ]),
    ...booleans(input, [
      "paused",
      "ended",
      "online",
      "sourceChangedSinceRequest",
      "playChangedSinceRequest",
      "currentSourceMismatch",
    ]),
    ...identifiers(input, ["operationTrackId", "failedTrackId"]),
  };
  for (const key of ["expectedPath", "currentSourcePath", "operationPath"]) {
    const path = mediaPath(input[key]);
    if (path) result[key] = path;
  }
  if (
    ["empty", "same_origin_audio", "redacted_or_other"].includes(
      input.currentSourceState,
    )
  )
    result.currentSourceState = input.currentSourceState;
  if (input.durationSeconds === null) result.durationSeconds = null;
  for (const key of ["mime", "operationMime"])
    if (typeof input[key] === "string" && MIME.test(input[key]))
      result[key] = input[key];
  if (["", "maybe", "probably"].includes(input.canPlayType))
    result.canPlayType = input.canPlayType;
  if (
    ["none", "paused", "playing", "unavailable"].includes(
      input.mediaSessionState,
    )
  )
    result.mediaSessionState = input.mediaSessionState;
  result.buffered = ranges(input.buffered);
  result.seekable = ranges(input.seekable);
  if (input.mediaError) result.mediaError = safeError(input.mediaError);
  if (input.playError) result.playError = safeError(input.playError);
  result.resources = Array.isArray(input.resources)
    ? input.resources.slice(-8).map(resourceDetails)
    : [];
  if (
    ["observer", "snapshot_only", "unavailable"].includes(
      input.resourceTimingSupport,
    )
  )
    result.resourceTimingSupport = input.resourceTimingSupport;
  return result;
}
export function probeDetails(input = {}) {
  const result = {
    ...identifiers(input, ["trackId"]),
    ...numbers(input, ["status", "startedAt", "durationMs"]),
    ...booleans(input, ["rangeHonored", "mimeMatches", "bodyRead"]),
    kind: "subsequent_foreground_probe",
  };
  const path = mediaPath(input.path);
  if (path) result.path = path;
  result.headerStates = {};
  for (const key of [
    "contentType",
    "contentLength",
    "contentRange",
    "acceptRanges",
    "contentEncoding",
  ]) {
    const value = input[key];
    const patterns = {
      contentType:
        /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;\s*charset=[a-z0-9_-]{1,30})?$/i,
      contentLength: /^\d{1,16}$/,
      contentRange: /^bytes (?:\d+-\d+|\*)\/(?:\d+|\*)$/,
      acceptRanges: /^(bytes|none)$/i,
      contentEncoding:
        /^(identity|gzip|br|deflate|zstd)(,\s*(identity|gzip|br|deflate|zstd)){0,3}$/i,
    };
    if (
      typeof value === "string" &&
      value.length <= 120 &&
      patterns[key].test(value)
    ) {
      result[key] = value;
      result.headerStates[key] = "captured";
    } else
      result.headerStates[key] =
        typeof value === "string" || input.headerStates?.[key] === "redacted"
          ? "redacted"
          : "missing";
  }
  if (input.error) result.error = safeError(input.error);
  result.evidence = responseEvidence(result.status);
  return result;
}

export function analyzeMedia(events) {
  const resources = events.filter((e) => e.resource).map((e) => e.resource);
  return events
    .filter(
      (e) =>
        ["audio-error", "play-request-rejected"].includes(e.event) && e.media,
    )
    .slice(-32)
    .map((e) => {
      const m = e.media,
        trackId = m.failedTrackId || e.trackId,
        generation = m.sourceGenerationAtRequest ?? m.sourceGeneration;
      const candidates = [...resources, ...m.resources].filter(
        (resource) =>
          resource.trackId === trackId &&
          resource.documentId === e.documentId &&
          resource.purpose === "original_media" &&
          resource.sourceGeneration === generation &&
          Number.isFinite(m.sourceStartTime) &&
          resource.startTime >= m.sourceStartTime &&
          resource.startTime <= m.snapshotAt,
      );
      const unique = [
        ...new Map(
          candidates.map((r) => [
            `${r.documentId}:${r.startTime}:${r.responseEnd}:${r.transferSize}`,
            r,
          ]),
        ).values(),
      ];
      const statuses = [
        ...new Set(
          unique
            .map((r) => r.responseStatus)
            .filter((s) => Number.isInteger(s) && s > 0),
        ),
      ];
      const cases = [
        ...new Set(
          statuses.map((s) =>
            s === 401 || s === 403
              ? "A"
              : s === 416
                ? "C"
                : s === 200 || s === 206
                  ? "D"
                  : "B",
          ),
        ),
      ];
      return {
        failureSequence: e.sequence,
        trackId,
        documentId: e.documentId,
        sourceGeneration: generation,
        candidateResourceIds: unique
          .slice(-32)
          .map((r) => r.id)
          .filter(Boolean),
        candidateCount: unique.length,
        omittedCandidateCount: Math.max(0, unique.length - 32),
        observedStatuses: statuses,
        cases: cases.length ? cases : ["E"],
        conclusiveCause: false,
        scope: "original_media_candidates_only",
        limitation:
          "Timing identifies candidate HTTP responses, not redirect chains, response headers, Range requests, body integrity, proxy origin or a codec diagnosis. Missing/zero status is inconclusive. Foreground probes are separate subsequent requests.",
      };
    });
}
