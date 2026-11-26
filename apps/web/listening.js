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
// Conservative observed progress: never integrate across a seek or a suspended callback gap.
export class QualifyingClock {
  constructor() {
    this.total = 0;
    this.last = null;
  }
  sample({ position, now, active, seeking = false }) {
    const previous = this.last;
    const positionMs = Math.floor(position * 1000);
    if (previous?.active && !seeking && Number.isFinite(position)) {
      const wall = now - previous.now,
        media = positionMs - previous.positionMs;
      if (wall > 0 && wall <= 2000 && media >= 0 && media <= wall * 1.2 + 50)
        this.total = Math.min(60000, this.total + media);
    }
    this.last = { positionMs, now, active: active && !seeking };
    return Math.floor(this.total);
  }
}
export function mountListening({
  audio,
  api,
  onAccount,
  onMessage,
  storage = () => localStorage,
  clock = () => performance.now(),
}) {
  let owner = null,
    generation = 0,
    current = null,
    account = null;
  const outboxKey = "musixene:qualifying-plays:v1";
  let outbox = [];
  function persist() {
    try {
      storage().setItem(outboxKey, JSON.stringify(outbox));
    } catch {
      /* In-memory retry still works. */
    }
  }
  function eligible(e) {
    return e && e.generation === generation && owner === e.owner;
  }
  function update(value) {
    if (value) {
      account = value;
      onAccount(value);
    }
  }
  function sample(
    active = !audio.paused && !audio.ended && audio.readyState >= 2,
  ) {
    const e = current;
    if (!eligible(e) || !e.started || e.short || e.sent) return;
    if (
      e.clock.sample({
        position: audio.currentTime,
        now: clock(),
        active,
        seeking: audio.seeking,
      }) >= 60000
    ) {
      e.sent = true;
      outbox = outbox.filter((x) => x.id !== e.id);
      if (outbox.length >= 20) {
        onMessage(
          "A listening report could not be queued. No charge has been confirmed.",
        );
        return;
      }
      outbox.push({ id: e.id, owner: e.owner, expires: Date.now() + 86400000 });
      persist();
      flush();
    }
  }
  let flushing = false;
  async function flush() {
    if (flushing || !owner) return;
    flushing = true;
    const g = generation;
    try {
      for (const item of [...outbox]) {
        if (g !== generation) break;
        if (item.expires < Date.now()) {
          outbox = outbox.filter((x) => x !== item);
          continue;
        }
        if (item.owner !== owner) continue;
        try {
          const result = await api("/api/listening/qualify", {
            method: "POST",
            body: JSON.stringify({ id: item.id, playedMs: 60000 }),
          });
          if (g !== generation) break;
          update(result.account);
          outbox = outbox.filter((x) => x !== item);
        } catch (error) {
          if ([404, 410].includes(error.status))
            outbox = outbox.filter((x) => x !== item);
          else break; // retry later in foreground; never pause audio because reporting failed
        }
      }
      persist();
    } finally {
      flushing = false;
    }
  }
  function close(e) {
    if (!eligible(e) || e.sent) return;
    e.promise
      ?.then(() => {
        if (eligible(e) && e.started && !e.short)
          return api("/api/listening/close", {
            method: "POST",
            body: JSON.stringify({ id: e.id }),
          }).then((r) => {
            if (eligible(e)) update(r.account);
          });
      })
      .catch(() => {});
  }
  function select(track) {
    sample(false);
    const previousId = current && !current.sent ? current.id : undefined;
    close(current);
    current = {
      id: crypto.randomUUID(),
      previousId,
      owner,
      generation,
      track,
      clock: new QualifyingClock(),
      started: false,
      sent: false,
    };
  }
  async function start(e) {
    if (!eligible(e)) return false;
    if (!Number.isFinite(audio.duration)) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => finish(new Error("Track duration unavailable. Try again.")),
          10000,
        );
        const loaded = () => finish(),
          failed = () => finish(new Error("Audio unavailable."));
        function finish(error) {
          clearTimeout(timer);
          audio.removeEventListener("loadedmetadata", loaded);
          audio.removeEventListener("error", failed);
          error ? reject(error) : resolve();
        }
        audio.addEventListener("loadedmetadata", loaded);
        audio.addEventListener("error", failed);
      });
    }
    if (!eligible(e) || current !== e) return false;
    e.short = audio.duration < 60;
    if (e.short) {
      e.started = true;
      return true;
    }
    const result = await api("/api/listening/start", {
      method: "POST",
      body: JSON.stringify({
        id: e.id,
        trackId: e.track.id,
        previousId: e.previousId,
        durationMs: Math.ceil(audio.duration * 1000),
        expectedPriceUnits: e.track.price_units ?? 0,
        expectedCharging: Boolean(account?.enabled),
      }),
    });
    if (!eligible(e)) return false;
    e.started = true;
    if (current !== e) {
      close(e);
      return false;
    }
    update(result.account);
    e.clock.last = null;
    sample();
    return true;
  }
  function prepare() {
    if (!owner || !current) return null;
    if (audio.ended) select(current.track);
    const e = current;
    if (!e.promise) {
      e.promise = start(e).catch((error) => {
        if (eligible(e) && current === e) {
          e.promise = null;
          onMessage(error.message);
        }
        return false;
      });
    }
    // Only funded tracks require an authorization hold before playback starts.
    return account?.enabled && !account.unlimited && e.track.price_units > 0
      ? e.promise
      : null;
  }
  for (const event of ["timeupdate", "playing", "play", "seeked"])
    audio.addEventListener(event, () => sample());
  for (const event of [
    "pause",
    "waiting",
    "stalled",
    "seeking",
    "ended",
    "error",
  ])
    audio.addEventListener(event, () => sample(false));
  async function foreground() {
    if (!owner || document.visibilityState !== "visible") return;
    const g = generation;
    flush();
    try {
      const value = await api("/api/listening/account");
      if (g === generation) update(value);
    } catch {
      /* Balance refresh must not interrupt playback. */
    }
  }
  window.addEventListener("online", foreground);
  document.addEventListener("visibilitychange", foreground);
  return {
    select,
    prepare,
    session(userId, value) {
      sample(false);
      close(current);
      generation++;
      current = null;
      owner = userId;
      account = value;
      try {
        const saved = JSON.parse(storage().getItem(outboxKey) || "[]");
        outbox = Array.isArray(saved)
          ? saved
              .filter(
                (x) =>
                  x &&
                  typeof x.id === "string" &&
                  typeof x.owner === "string" &&
                  Number.isFinite(x.expires),
              )
              .slice(-20)
          : [];
      } catch {
        outbox = [];
      }
      if (owner) {
        update(value);
        flush();
      }
    },
  };
}
