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
import { MediaDiagnostics } from "./media-diagnostics.js";
import { LIMITS, details, validateReport } from "./diagnostic-format.js";
const DB_NAME = "musixene-diagnostics-v1";
const encoder = new TextEncoder();
function database() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error("Diagnostic storage timed out"));
    }, 2000);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("recording");
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Diagnostic storage unavailable"));
    };
    request.onblocked = () => {
      clearTimeout(timer);
      settled = true;
      reject(new Error("Diagnostic storage is blocked"));
    };
  });
}
// One bounded object, atomic replacement; writes are batched at the end of each task.
async function storage(operation, value, expected) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
          "recording",
          operation === "read" ? "readonly" : "readwrite",
        ),
        store = tx.objectStore("recording");
      const timer = setTimeout(() => {
        try {
          tx.abort();
        } catch {}
        reject(new Error("Diagnostic storage timed out"));
      }, 2000);
      let result;
      const read = store.get("current");
      read.onsuccess = () => {
        try {
          result = read.result;
          if (operation === "write") {
            if (
              (result?.bindingKey || null) !== (expected || null) ||
              (result &&
                (result.sequence > value.sequence ||
                  (result.status !== "recording" &&
                    value.status === "recording")))
            ) {
              tx.abort();
              return;
            }
            store.put(value, "current");
          } else if (
            operation === "clear" &&
            (!expected || result?.bindingKey === expected)
          )
            store.delete("current");
        } catch {
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(result);
      };
      tx.onabort = tx.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Diagnostic storage changed or unavailable"));
      };
    });
  } finally {
    db.close();
  }
}
function browserDescription() {
  const ua = navigator.userAgent;
  const match = /(Edg|Firefox|Chrome|Version)\/([0-9.]+)/.exec(ua);
  return {
    name: match?.[1] || "Unknown",
    version: match?.[2] || "Unknown",
    os: /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh/.test(ua)
            ? "macOS"
            : "Other",
    mode: matchMedia("(display-mode: standalone)").matches ? "PWA" : "Browser",
  };
}
export class Diagnostics extends EventTarget {
  constructor() {
    super();
    this.media = new MediaDiagnostics(this);
    this.state = null;
    this.context = null;
    this.csrf = "";
    this.epoch = 0;
    this.pending = Promise.resolve();
    this.scheduled = false;
    this.suspended = true;
    this.message = "";
    this.documentId = crypto.randomUUID();
    this.lastVisible = Date.now();
    this.lastEvent = Date.now();
    this.lastSample = 0;
    try {
      this.tabId =
        sessionStorage.getItem("diagnostic-tab") || crypto.randomUUID();
      sessionStorage.setItem("diagnostic-tab", this.tabId);
    } catch {
      this.tabId = null;
    }
    try {
      this.channel = new BroadcastChannel("musixene-diagnostic-ownership");
      this.channel.onmessage = () => {
        this.suspended = true;
        this.revalidate().catch(() => {});
      };
    } catch {}
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.revalidate()
          .then(() => {
            this.event("lifecycle", "visibilitychange", {
              sinceVisibleMs: Date.now() - this.lastVisible,
            });
            this.lastVisible = Date.now();
          })
          .catch(() => {});
      } else {
        this.lastVisible = Date.now();
        this.event("lifecycle", "visibilitychange");
        this.flush();
      }
    });
    for (const type of ["pagehide", "freeze"])
      (type === "freeze" ? document : window).addEventListener(type, (e) => {
        this.event("lifecycle", type, {
          persisted: !!e.persisted,
          lifecycle: type === "freeze" ? "frozen" : "navigating",
        });
        this.flush();
        this.suspended = true;
      });
    for (const type of ["pageshow", "resume", "online"])
      (type === "resume" ? document : window).addEventListener(type, (e) => {
        this.revalidate()
          .then(() =>
            this.event(type === "online" ? "network" : "lifecycle", type, {
              persisted: !!e.persisted,
              online: navigator.onLine,
              sinceVisibleMs: Date.now() - this.lastVisible,
            }),
          )
          .catch(() => {});
      });
    addEventListener("offline", () =>
      this.event("network", "offline", { online: false }),
    );
    // Unrestricted exception messages/stacks may contain notes or credentials.
    addEventListener("error", () =>
      this.event("application", "unhandled-error", {
        error: {
          name: "Error",
          message: "Unhandled application error; details intentionally omitted",
        },
      }),
    );
    addEventListener("unhandledrejection", () =>
      this.event("application", "unhandled-rejection", {
        error: {
          name: "Error",
          message: "Unhandled rejection; details intentionally omitted",
        },
      }),
    );
  }
  changed() {
    this.media.sync();
    this.dispatchEvent(new Event("change"));
  }
  async request(path, data, signal) {
    const controller = signal ? null : new AbortController();
    const timer = controller
      ? setTimeout(() => controller.abort(), 5000)
      : null;
    try {
      const response = await fetch("/api/admin/diagnostics/" + path, {
        method: data === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": this.csrf,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: signal || controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(result.error || "Diagnostic request failed"),
          { status: response.status },
        );
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  async initialize(me) {
    this.epoch++;
    this.validation = null;
    this.context = null;
    this.state = null;
    this.suspended = true;
    this.csrf = me.csrf;
    this.administratorId = me.user.id;
    if (me.user.role !== "administrator") {
      await this.clear({ ownedOnly: true });
      return;
    }
    await this.revalidate();
    this.event("authentication", "authenticated-session-observed");
    this.event("lifecycle", "application-initialized");
  }
  async revalidate() {
    if (!this.csrf) return;
    if (this.validation) return this.validation;
    const validation = this.validateContext();
    this.validation = validation;
    validation.finally(() => {
      if (this.validation === validation) this.validation = null;
    });
    return validation;
  }
  async validateContext() {
    const epoch = this.epoch;
    this.suspended = true;
    try {
      const ctx = await this.request("context");
      if (epoch !== this.epoch) return;
      await this.pending;
      const saved = await storage("read");
      if (epoch !== this.epoch) return;
      if (
        ctx.administratorId !== this.administratorId ||
        (this.context &&
          (this.context.sessionContext !== ctx.sessionContext ||
            this.context.administratorId !== ctx.administratorId ||
            this.context.installationId !== ctx.installationId))
      ) {
        await this.clear({ ownedOnly: true });
        this.message =
          "Authentication changed. Reload to use diagnostics in the new session.";
        this.changed();
        return;
      }
      this.context = ctx;
      const owner = [
        ctx.installationId,
        ctx.administratorId,
        ctx.sessionContext,
      ].join(":");
      if (
        saved &&
        (saved.owner !== owner ||
          Date.now() - saved.startedAt > LIMITS.durationMs)
      ) {
        await storage("clear", null, saved.bindingKey);
        this.state = null;
        this.message = "Previous-session diagnostic data cleared.";
      } else if (saved?.tabId === this.tabId) {
        this.state = saved;
        this.lastEvent =
          Date.parse(saved.events.at(-1)?.timestamp) || Date.now();
        this.lastVisible = saved.lastVisible || this.lastVisible;
        this.baseElapsed = Math.max(
          0,
          Date.now() - saved.startedAt,
          saved.elapsedMs || 0,
        );
        this.basePerformance = performance.now();
        if (saved.status === "finalizing") {
          this.state.status = "upload_failed";
          this.message = "Upload acknowledgment is uncertain. Retry is safe.";
        }
      } else if (saved) {
        this.state = null;
        this.message =
          "A recording is held by another tab. Return to that tab to stop or export it.";
      }
      if (
        this.state?.status === "recording" &&
        (!ctx.allowed ||
          !ctx.enabled ||
          this.state.generation !== ctx.generation)
      ) {
        this.finalize("policy_revoked");
        this.message =
          "Permission changed. Recording stopped; export or discard the local report.";
      }
      this.suspended = false;
      this.permissionValidation = (this.permissionValidation || 0) + 1;
      this.changed();
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (error.status === 401 || error.status === 403) {
        await this.clear({ ownedOnly: true });
        this.context = null;
        this.csrf = "";
      } else if (this.context && this.state) {
        this.suspended = false;
        this.message =
          "Offline: recording locally under the last validated session. Permission will be checked on reconnect.";
      } else {
        this.message = error.message;
      }
      this.changed();
    }
  }
  async clear({ ownedOnly = false } = {}) {
    const expected = ownedOnly
      ? this.state?.bindingKey || "no-owned-recording"
      : undefined;
    this.epoch++;
    this.abort?.abort();
    this.uploading = null;
    this.suspended = true;
    this.state = null;
    this.context = null;
    this.csrf = "";
    await this.pending.catch(() => {});
    // A new session cannot open old bindings, even if storage cannot be cleared.
    await storage("clear", null, expected).catch(() => {
      this.message =
        "Browser diagnostic storage is unavailable. Previous-session data cannot be opened in a new session.";
    });
    this.channel?.postMessage("revalidate");
    this.changed();
  }
  async beforeAuthentication() {
    await this.clear();
  }
  async start() {
    await this.revalidate();
    const ctx = this.context;
    if (!ctx?.allowed || !ctx.enabled || !this.tabId)
      throw new Error(
        "Diagnostics require server permission, instance enablement, and session storage",
      );
    const saved = await storage("read");
    if (saved)
      throw new Error("Stop or discard the existing local report first");
    const startedAt = Date.now(),
      id = crypto.randomUUID(),
      owner = [
        ctx.installationId,
        ctx.administratorId,
        ctx.sessionContext,
      ].join(":");
    await this.request("recordings", { recordingId: id, startedAt });
    this.state = {
      id,
      owner,
      bindingKey: owner + ":" + id,
      tabId: this.tabId,
      generation: ctx.generation,
      startedAt,
      elapsedMs: 0,
      status: "recording",
      events: [],
      sequence: 0,
      droppedEvents: 0,
      browser: browserDescription(),
      applicationVersion: ctx.applicationVersion,
      bytes: 0,
    };
    try {
      await storage("write", this.state, null);
    } catch (error) {
      this.state = null;
      throw error;
    }
    this.baseElapsed = 0;
    this.basePerformance = performance.now();
    this.suspended = false;
    this.message = "Recording locally. No events are being uploaded.";
    this.event("lifecycle", "recording-started");
    this.changed();
  }
  elapsed() {
    if (this.state && this.state.status !== "recording")
      return this.state.elapsedMs;
    return Math.min(
      LIMITS.durationMs,
      Math.max(
        this.state?.elapsedMs || 0,
        (this.baseElapsed || 0) +
          performance.now() -
          (this.basePerformance || performance.now()),
      ),
    );
  }
  event(category, event, value = {}) {
    if (
      this.suspended ||
      this.state?.status !== "recording" ||
      !this.context?.allowed ||
      !this.context.enabled
    )
      return;
    try {
      const elapsedMs = this.elapsed();
      if (elapsedMs >= LIMITS.durationMs) {
        this.finalize("duration_limit");
        return;
      }
      const now = Date.now(),
        extra = typeof value === "function" ? value() : value;
      this.append(
        category,
        event,
        { ...extra, gapMs: Math.max(0, now - this.lastEvent) },
        elapsedMs,
      );
      this.lastEvent = now;
      this.schedule();
    } catch {
      /* Diagnostic failures must not propagate into playback. */
    }
  }
  append(category, event, value, elapsedMs = this.elapsed()) {
    const state = this.state;
    if (!state) return;
    const item = {
      timestamp: new Date().toISOString(),
      elapsedMs,
      sequence: ++state.sequence,
      category,
      event,
      visibility: document.visibilityState === "hidden" ? "hidden" : "visible",
      ...details({ ...value, documentId: this.documentId }),
    };
    state.events.push(item);
    state.bytes += encoder.encode(JSON.stringify(item)).length + 1;
    state.elapsedMs = elapsedMs;
    while (
      state.events.length > LIMITS.events ||
      state.bytes > LIMITS.eventBytes
    ) {
      state.bytes -=
        encoder.encode(JSON.stringify(state.events.shift())).length + 1;
      state.droppedEvents++;
    }
  }
  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.flush();
    });
  }
  flush() {
    if (!this.state) return this.pending;
    this.dirty = true;
    if (this.writing) return this.pending;
    this.writing = true;
    const epoch = this.epoch;
    this.pending = (async () => {
      try {
        while (this.dirty && this.state && epoch === this.epoch) {
          this.dirty = false;
          this.state.lastVisible = this.lastVisible;
          const snapshot = structuredClone(this.state);
          await storage("write", snapshot, snapshot.bindingKey);
          if (epoch === this.epoch) this.changed();
        }
      } catch {
        this.dirty = false;
        if (epoch !== this.epoch) return;
        if (this.state?.status === "recording")
          this.finalize("storage_failure", false);
        this.message =
          "Local diagnostic storage failed. Playback is unaffected; export or retry this report before leaving.";
        this.changed();
      } finally {
        this.writing = false;
      }
    })();
    return this.pending;
  }
  finalize(reason, write = true) {
    const state = this.state;
    if (!state || state.status !== "recording") return;
    this.append("lifecycle", "recording-stopped", {}, this.elapsed());
    state.reason = reason;
    state.endedAt = new Date().toISOString();
    state.status = "upload_failed";
    if (write) this.flush();
    this.changed();
  }
  report() {
    const state = this.state;
    if (!state) throw new Error("No local report");
    return validateReport({
      reportVersion: 2,
      recordingId: state.id,
      startedAt: new Date(state.startedAt).toISOString(),
      endedAt: state.endedAt || new Date().toISOString(),
      durationMs: this.elapsed(),
      reason: state.reason || "manual_stop",
      applicationVersion: state.applicationVersion,
      browser: state.browser,
      droppedEvents: state.droppedEvents,
      events: state.events,
    });
  }
  stop(reason = "manual_stop") {
    if (this.uploading) return this.uploading;
    const uploading = this.upload(reason).finally(() => {
      if (this.uploading === uploading) this.uploading = null;
    });
    this.uploading = uploading;
    return uploading;
  }
  async upload(reason) {
    const epoch = this.epoch,
      state = this.state,
      ctx = this.context;
    if (!state) return;
    if (!ctx) throw new Error("Original session required");
    this.finalize(reason);
    state.status = "finalizing";
    await this.flush();
    if (epoch !== this.epoch) return;
    // Freeze the report across retries, including ambiguous network acknowledgments.
    state.report ||= this.report();
    state.events = state.report.events;
    state.status = "finalizing";
    this.changed();
    await this.flush();
    if (epoch !== this.epoch) return;
    const controller = new AbortController();
    this.abort = controller;
    let timer;
    try {
      const result = await Promise.race([
        this.request(
          "reports",
          {
            recordingId: state.id,
            sessionContext: ctx.sessionContext,
            installationId: ctx.installationId,
            report: state.report,
          },
          controller.signal,
        ),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Upload timed out after 8 seconds"));
          }, LIMITS.uploadMs);
        }),
      ]);
      if (epoch !== this.epoch) return;
      if (!result.saved || result.reportId !== state.id)
        throw new Error("Report was not acknowledged");
      await storage("clear", null, state.bindingKey);
      this.state = null;
      this.message = "Report saved on this installation.";
      this.changed();
    } catch (error) {
      if (epoch === this.epoch) {
        if (
          error.status === 401 ||
          (error.status === 403 &&
            /session|access|sign in/i.test(error.message))
        ) {
          await this.clear({ ownedOnly: true });
        } else {
          state.status = "upload_failed";
          this.message = error.message;
          await this.flush();
          this.changed();
        }
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (this.abort === controller) this.abort = null;
    }
  }
  async discard() {
    if (!this.state) return;
    await this.pending;
    await storage("clear", null, this.state.bindingKey);
    this.state = null;
    this.message = "Local report discarded.";
    this.changed();
  }
  exportLocal() {
    if (this.suspended)
      throw new Error("Validate the original session before exporting");
    this.download(
      this.state?.report || this.report(),
      `diagnostic-${this.state.id}.json`,
    );
  }
  download(report, filename) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async prepareLogout() {
    if (!this.state && this.context) {
      // The same authenticated session may be open in another tab. Logout may
      // finalize its existing local recording, but never resumes collection there.
      const saved = await storage("read").catch(() => null);
      const owner = [
        this.context.installationId,
        this.context.administratorId,
        this.context.sessionContext,
      ].join(":");
      if (saved?.owner === owner) {
        this.state = saved;
        this.baseElapsed = Math.max(
          saved.elapsedMs,
          Date.now() - saved.startedAt,
        );
        this.basePerformance = performance.now();
      }
    }
    if (!this.state) return true;
    this.event("authentication", "logout-initiated");
    for (;;) {
      try {
        await this.stop("logout");
        return true;
      } catch {
        if (!this.state) return true;
        const choice = await this.logoutChoice();
        if (choice === "retry") continue;
        if (choice === "cancel") return false;
        if (choice === "export") this.exportLocal();
        if (
          choice === "discard" &&
          !confirm(
            "Discard this unsaved diagnostic report and continue logout? It cannot be recovered.",
          )
        )
          continue;
        await this.discard().catch(() => {
          this.state = null;
          this.suspended = true;
          this.message =
            "Browser storage could not be cleared; its old session binding prevents access after logout.";
        });
        return true;
      }
    }
  }
  logoutChoice() {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog"),
        text = document.createElement("p");
      text.textContent =
        "Diagnostic upload failed or timed out. The report is not saved on the server. Retry, export before logout, or explicitly discard it.";
      dialog.append(text);
      const finish = (choice) => {
        dialog.close();
        dialog.remove();
        resolve(choice);
      };
      for (const [label, choice] of [
        ["Retry Upload", "retry"],
        ["Export and Continue Logout", "export"],
        ["Discard and Continue Logout", "discard"],
        ["Cancel Logout", "cancel"],
      ]) {
        const b = document.createElement("button");
        b.textContent = label;
        b.onclick = () => finish(choice);
        dialog.append(b);
      }
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish("cancel");
      });
      document.body.append(dialog);
      dialog.showModal();
    });
  }
  throttled(category, event, value) {
    this.throttleTimes ||= new Map();
    if (
      performance.now() - (this.throttleTimes.get(event) ?? -Infinity) <
      30000
    )
      return;
    this.throttleTimes.set(event, performance.now());
    this.event(category, event, value);
  }
  sample(audio, snapshot) {
    if (
      this.state?.status !== "recording" ||
      performance.now() - this.lastSample < 30000
    )
      return;
    this.lastSample = performance.now();
    this.event("playback", "position-sample", snapshot);
  }
}
export const diagnostics = new Diagnostics();
