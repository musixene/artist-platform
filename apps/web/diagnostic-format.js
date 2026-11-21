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
export function safeError(error) {
  const name = /^[A-Za-z]{1,60}(Error|Exception)$/.test(error?.name || "")
    ? error.name
    : "Error";
  const message = String(error?.message || "")
    .slice(0, 400)
    .replace(/(?:https?|file|blob|data):[^\s]+/gi, "[URL]")
    .replace(/[\w.+-]+@[\w.-]+/g, "[address]")
    .replace(
      /(?:password|cookie|authorization|token|csrf|secret)\s*[:=]\s*[^,;\n]+/gi,
      "[redacted]",
    )
    .replace(/[A-Za-z0-9_+/=-]{32,}/g, "[redacted]");
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
export function details(value = {}) {
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
  if (value.error) result.error = safeError(value.error);
  return result;
}
export function validateReport(input) {
  const bad = () => {
    throw new Error("Invalid diagnostic report");
  };
  if (
    !input ||
    input.reportVersion !== 1 ||
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
      ...details(e),
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
  return {
    reportVersion: 1,
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
}
