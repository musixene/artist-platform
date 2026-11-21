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
import {
  mediaPath,
  resourceDetails,
  mediaDetails,
  probeDetails,
  UUID,
} from "./diagnostic-format.js";
// Passive observation only. Never load(), play(), seek(), swap sources, or poll.
export class MediaDiagnostics {
  constructor(recorder) {
    this.recorder = recorder;
    this.sourceGeneration = 0;
    this.playOperationId = 0;
    this.sources = [];
    this.support = "unavailable";
    this.probing = false;
    this.probeWindows = [];
  }
  active() {
    const r = this.recorder;
    return (
      !r.suspended &&
      r.state?.status === "recording" &&
      r.context?.allowed &&
      r.context.enabled
    );
  }
  sync() {
    if (!this.active()) {
      this.observer?.disconnect();
      this.observer = null;
      this.probeController?.abort();
      if (!this.recorder.state) {
        this.sources = [];
        this.probeWindows = [];
      }
      return;
    }
    if (this.observer) return;
    this.support =
      typeof performance.getEntriesByType === "function"
        ? "snapshot_only"
        : "unavailable";
    if (typeof PerformanceObserver === "function")
      try {
        this.observer = new PerformanceObserver((list) => {
          if (!this.active()) return;
          for (const entry of list.getEntries()) this.observe(entry);
        });
        this.observer.observe({ type: "resource", buffered: false });
        this.support = "observer";
      } catch {
        this.observer?.disconnect();
        this.observer = null;
      }
  }
  sourceChange(trackId) {
    if (!this.active()) return;
    this.sourceGeneration++;
    this.sources.push({
      trackId,
      startTime: performance.now(),
      generation: this.sourceGeneration,
    });
    this.sources = this.sources.slice(-32);
  }
  playRequested(trackId, mime) {
    if (!this.active()) return null;
    return {
      trackId,
      mime,
      sourceGeneration: this.sourceGeneration,
      playOperationId: ++this.playOperationId,
      startedAt: performance.now(),
    };
  }
  resource(entry) {
    const r = this.recorder,
      path = mediaPath(entry.name, location.origin);
    if (!path) return null;
    const absolute = performance.timeOrigin + entry.startTime;
    if (absolute < r.state.startedAt) return null;
    const trackId = path.split("/")[3];
    const source = this.sources.findLast(
      (s) => s.trackId === trackId && s.startTime <= entry.startTime,
    );
    const purpose =
      entry.initiatorType === "fetch" &&
      this.probeWindows.some(
        (w) =>
          w.path === path &&
          entry.startTime >= w.start &&
          entry.startTime <= (w.end ?? Infinity),
      )
        ? "subsequent_foreground_probe"
        : ["fetch", "xmlhttprequest"].includes(entry.initiatorType)
          ? "unclassified"
          : "original_media";
    const value = {
      purpose,
      id: crypto.randomUUID(),
      documentId: r.documentId,
      path,
      trackId,
      timeOrigin: performance.timeOrigin,
      initiatorType: entry.initiatorType,
      protocol: entry.nextHopProtocol,
      sourceGeneration: source?.generation,
    };
    for (const key of [
      "startTime",
      "requestStart",
      "responseStart",
      "responseEnd",
      "duration",
      "responseStatus",
      "transferSize",
      "encodedBodySize",
      "decodedBodySize",
    ])
      try {
        if (typeof entry[key] === "number") value[key] = entry[key];
      } catch {}
    return resourceDetails(value);
  }
  observe(entry) {
    try {
      const value = this.resource(entry);
      if (!value) return;
      const r = this.recorder;
      // Each entry is independent: several ranges for one track are not collapsed.
      r.state.mediaResources ||= [];
      r.state.mediaResources.push(value);
      r.state.mediaResources = r.state.mediaResources.slice(-64);
      r.event("network", "audio-resource-timing", { resource: value });
    } catch {
      /* Observation failures must not reach audio callbacks. */
    }
  }
  resources(trackId) {
    const r = this.recorder;
    const cached = (r.state?.mediaResources || [])
      .filter((e) => e.trackId === trackId)
      .slice(-8);
    // A failure callback may precede observer delivery; query the existing buffer too.
    try {
      for (const entry of performance
        .getEntriesByType("resource")
        .slice(-128)) {
        const value = this.resource(entry);
        if (value?.trackId !== trackId) continue;
        if (
          !cached.some(
            (e) =>
              e.documentId === value.documentId &&
              e.startTime === value.startTime &&
              e.responseEnd === value.responseEnd &&
              e.transferSize === value.transferSize,
          )
        )
          cached.push(value);
      }
    } catch {}
    return cached.slice(-8);
  }
  snapshot(audio, track, operation, error) {
    if (!this.active()) return undefined;
    try {
      const id = operation?.trackId || track?.id,
        expectedPath = track?.id ? `/api/tracks/${track.id}/audio` : undefined;
      const currentSourcePath = mediaPath(audio.currentSrc, location.origin);
      const readRanges = (value) => {
        const values = [];
        try {
          for (let i = 0; i < Math.min(value.length, 8); i++)
            values.push([value.start(i), value.end(i)]);
        } catch {}
        return values;
      };
      let canPlayType;
      try {
        if (track?.mime) canPlayType = audio.canPlayType(track.mime);
      } catch {}
      let mediaSessionState = "unavailable";
      try {
        mediaSessionState =
          navigator.mediaSession?.playbackState || "unavailable";
      } catch {}
      return mediaDetails({
        failedTrackId: id,
        expectedPath,
        currentSourcePath,
        currentSourceState: !audio.currentSrc
          ? "empty"
          : currentSourcePath
            ? "same_origin_audio"
            : "redacted_or_other",
        currentSourceMismatch:
          currentSourcePath && expectedPath
            ? currentSourcePath !== expectedPath
            : undefined,
        sourceGeneration: this.sourceGeneration,
        playOperationId: this.playOperationId,
        sourceStartTime: this.sources.findLast(
          (s) =>
            s.trackId === id &&
            s.generation ===
              (operation?.sourceGeneration ?? this.sourceGeneration),
        )?.startTime,
        operationPath: operation
          ? `/api/tracks/${operation.trackId}/audio`
          : undefined,
        operationMime: operation?.mime,
        sourceGenerationAtRequest: operation?.sourceGeneration,
        playOperationIdAtRequest: operation?.playOperationId,
        operationStartedAt: operation?.startedAt,
        operationTrackId: operation?.trackId,
        sourceChangedSinceRequest: operation
          ? operation.sourceGeneration !== this.sourceGeneration
          : undefined,
        playChangedSinceRequest: operation
          ? operation.playOperationId !== this.playOperationId
          : undefined,
        snapshotAt: performance.now(),
        timeOrigin: performance.timeOrigin,
        positionSeconds: audio.currentTime,
        durationSeconds: Number.isFinite(audio.duration)
          ? audio.duration
          : null,
        readyState: audio.readyState,
        networkState: audio.networkState,
        paused: audio.paused,
        ended: audio.ended,
        online: navigator.onLine,
        sinceVisibleMs: Math.max(0, Date.now() - this.recorder.lastVisible),
        mime: track?.mime,
        canPlayType,
        buffered: readRanges(audio.buffered),
        seekable: readRanges(audio.seekable),
        mediaErrorCode: audio.error?.code,
        mediaError: audio.error
          ? { name: "MediaError", message: audio.error.message }
          : undefined,
        playError: error,
        mediaSessionState,
        resources: this.resources(id),
        resourceTimingSupport: this.support,
      });
    } catch {
      return undefined;
    }
  }
  failure(audio, track, operation, error) {
    const media = this.snapshot(audio, track, operation, error);
    if (media && UUID.test(media.failedTrackId || "")) {
      this.recorder.state.failedMedia = {
        trackId: media.failedTrackId,
        mime: operation?.mime || track?.mime,
        timestamp: Date.now(),
      };
    }
    return media;
  }
  canProbe() {
    return (
      this.active() &&
      document.visibilityState === "visible" &&
      !!this.recorder.state?.failedMedia &&
      !this.probing
    );
  }
  async probe() {
    const r = this.recorder;
    if (!this.canProbe())
      throw new Error(
        "An active administrator recording, failed track, and foreground page are required",
      );
    const epoch = r.epoch,
      validation = r.permissionValidation || 0;
    await r.revalidate();
    if (
      epoch !== r.epoch ||
      !this.canProbe() ||
      !(r.permissionValidation > validation)
    )
      throw new Error(
        "Original authorized recording and foreground page required",
      );
    const failed = r.state.failedMedia,
      path = mediaPath(`/api/tracks/${failed.trackId}/audio`);
    if (!path) throw new Error("Invalid failed track");
    this.probing = true;
    r.changed();
    const controller = new AbortController(),
      started = performance.now();
    this.probeController = controller;
    const window = { path, start: started };
    this.probeWindows.push(window);
    this.probeWindows = this.probeWindows.slice(-8);
    r.event("network", "foreground-media-probe-started", {
      probe: probeDetails({
        trackId: failed.trackId,
        path,
        startedAt: performance.timeOrigin + started,
        bodyRead: false,
      }),
    });
    const timer = setTimeout(() => controller.abort(), 8000);
    const hidden = () => {
      if (document.visibilityState !== "visible") controller.abort();
    };
    document.addEventListener("visibilitychange", hidden);
    let evidence;
    try {
      const response = await fetch(path, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "manual",
        headers: { Range: "bytes=0-0" },
        signal: controller.signal,
      });
      const headers = response.headers;
      evidence = probeDetails({
        trackId: failed.trackId,
        path,
        status: response.status,
        startedAt: performance.timeOrigin + started,
        durationMs: performance.now() - started,
        contentType: headers.get("Content-Type"),
        contentLength: headers.get("Content-Length"),
        contentRange: headers.get("Content-Range"),
        acceptRanges: headers.get("Accept-Ranges"),
        contentEncoding: headers.get("Content-Encoding"),
        rangeHonored:
          response.status === 206 &&
          /^bytes 0-0\/[1-9]\d*$/.test(headers.get("Content-Range") || "") &&
          headers.get("Content-Length") === "1",
        mimeMatches:
          !!failed.mime &&
          headers.get("Content-Type")?.split(";")[0].toLowerCase() ===
            failed.mime.toLowerCase(),
        bodyRead: false,
      });
      // Stop at headers, even when a proxy ignores Range and replies 200. No body reader.
      controller.abort();
      response.body?.cancel().catch(() => {});
    } catch (error) {
      evidence = probeDetails({
        trackId: failed.trackId,
        path,
        startedAt: performance.timeOrigin + started,
        durationMs: performance.now() - started,
        bodyRead: false,
        error,
      });
    } finally {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hidden);
      this.probing = false;
      window.end = performance.now();
      if (this.probeController === controller) this.probeController = null;
    }
    if (epoch !== r.epoch || !this.active()) return;
    r.event("network", "foreground-media-probe", { probe: evidence });
    r.message = `Subsequent foreground probe: ${evidence.status ? "HTTP " + evidence.status : "no observable response"}. It does not establish the original background response.`;
    r.changed();
    return evidence;
  }
}
