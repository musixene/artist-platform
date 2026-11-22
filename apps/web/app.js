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
import { trackFeedback, mountFeedbackData } from "./feedback-ui.js";
import { diagnostics } from "./diagnostics.js";
import { PlaybackQueue } from "./player.js";
const $ = (id) => document.getElementById(id),
  audio = $("audio");
const queue = new PlaybackQueue(),
  feedbackRoots = new Map(),
  likes = new Map();
let csrf = "",
  tracks = new Map(),
  catalogs = [],
  activeId = null,
  shuffle = false,
  repeat = "off",
  register = false,
  registrationAllowed = false;
let sessionGeneration = 0;
let config = { name: "Independent Artist", assets: {} };
function message(text = "") {
  $("message").textContent = text;
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    diagnostics.event(
      response.status === 401 || response.status === 403
        ? "authentication"
        : "network",
      "request-failed",
      { status: response.status },
    );
    if (response.status === 401)
      diagnostics.clear({ ownedOnly: true }).catch(() => {});
    else if (response.status === 403) diagnostics.revalidate().catch(() => {});
  }
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: response.status,
    });
  return data;
}
function applyBranding(value) {
  config = value;
  $("brand").textContent = value.wordmark || value.name;
  $("tagline").textContent = value.tagline;
  $("tagline").hidden = !value.tagline;
  document.title = `${value.name} · Listening room`;
  document
    .querySelector(".wordmark")
    .setAttribute("aria-label", `${value.name} listening room home`);
  document.querySelector("meta[name=theme-color]").content = value.accent;
  $("favicon").href = value.assets.favicon || "/branding/favicon";
  $("apple-icon").href =
    value.assets.icon512 || value.assets.icon192 || "/branding/icon512";
  $("brand-logo").hidden = !value.assets.logo;
  $("brand").hidden = Boolean(value.assets.logo);
  if (value.assets.logo) {
    $("brand-logo").src = value.assets.logo;
    $("brand-logo").alt = `${value.name} logo`;
    $("brand-logo").onerror = () => {
      $("brand-logo").hidden = true;
      $("brand").hidden = false;
    };
  }
}
function authMode() {
  $("auth-title").textContent = register
    ? "Your space to listen."
    : "Come on in.";
  $("auth-submit").textContent = register
    ? "Create listener account"
    : "Sign in";
  $("auth-toggle").textContent = register
    ? "Already here? Sign in"
    : registrationAllowed
      ? "New here? Create a listener account"
      : "Have an invitation? Create a listener account";
  $("password").autocomplete = register ? "new-password" : "current-password";
  $("invitation").hidden = $("invitation-label").hidden = !register;
}
function signedOut() {
  diagnostics.clear({ ownedOnly: true }).catch(() => {});
  sessionGeneration++;
  for (const root of feedbackRoots.values())
    root.querySelector("dialog")?.close();
  csrf = "";
  register = false;
  authMode();
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  }
  tracks.clear();
  likes.clear();
  feedbackRoots.clear();
  activeId = null;
  catalogs = [];
  queue.select([], null, "All Catalogs");
  $("tracks").replaceChildren();
  $("active-feedback").replaceChildren();
  $("feedback-data").replaceChildren();
  $("library").hidden =
    $("account-menu").hidden =
    $("logout").hidden =
    $("admin-link").hidden =
      true;
  $("account-menu").open = false;
  $("auth").hidden = false;
  $("identity").textContent = "";
  $("diagnostics-link").hidden = true;
}
async function signedIn(data) {
  const generation = ++sessionGeneration;
  csrf = data.csrf;
  await diagnostics.initialize(data).catch(() => {});
  $("diagnostics-link").hidden = data.user.role !== "administrator";
  const library = await api("/api/catalog");
  if (generation !== sessionGeneration) return;
  tracks = new Map(library.tracks.map((t) => [t.id, t]));
  catalogs = library.catalogs;
  likes.clear();
  for (const track of library.tracks) likes.set(track.id, Boolean(track.liked));
  $("auth").hidden = true;
  $("library").hidden = $("account-menu").hidden = $("logout").hidden = false;
  $("identity").textContent = data.user.username;
  $("admin-link").hidden = data.user.role !== "administrator";
  $("collection-filter").replaceChildren(
    ...catalogs.map((c) => new Option(c.title, c.id)),
  );
  mountFeedbackData($("feedback-data"), api, () => {
    likes.clear();
    for (const root of feedbackRoots.values())
      root.dispatchEvent(new Event("feedback-cleared"));
  });
  mode("player");
  renderTracks();
  const first = selectedCatalog()?.trackIds[0];
  if (first) {
    queue.select(selectedCatalog().trackIds, first, selectedCatalog().title);
    activate(first, { autoplay: false });
  } else {
    for (const id of ["play", "next", "previous", "shuffle", "repeat"])
      $(id).disabled = true;
  }
}
const selectedCatalog = () =>
  catalogs.find((c) => c.id === $("collection-filter").value);
function renderTracks() {
  const catalog = selectedCatalog(),
    items = (catalog?.trackIds || [])
      .map((id) => tracks.get(id))
      .filter(Boolean);
  $("track-count").textContent =
    `${items.length} ${items.length === 1 ? "track" : "tracks"}`;
  $("empty").hidden = items.length > 0;
  $("tracks").replaceChildren(
    ...items.map((track, index) => {
      const li = document.createElement("li"),
        button = document.createElement("button");
      li.dataset.trackId = track.id;
      button.className = "track";
      button.dataset.trackId = track.id;
      const number = document.createElement("span");
      number.className = "track-index";
      number.textContent = String(index + 1).padStart(2, "0");
      number.setAttribute("aria-hidden", "true");
      const info = document.createElement("span");
      info.className = "track-info";
      const title = document.createElement("span");
      title.className = "track-row-title";
      const strong = document.createElement("strong");
      strong.textContent = track.title;
      title.append(strong);
      if (track.explicit_status === "explicit") {
        const badge = document.createElement("span");
        badge.className = "explicit";
        badge.textContent = "E";
        badge.setAttribute("aria-label", "Explicit");
        title.append(badge);
      }
      const artist = document.createElement("small");
      artist.textContent = track.artist;
      info.append(title, artist);
      const action = document.createElement("span");
      action.className = "track-action";
      action.textContent = "▷";
      action.setAttribute("aria-hidden", "true");
      button.append(number, info, action);
      button.addEventListener("click", () => {
        queue.select(catalog.trackIds, track.id, catalog.title);
        if (track.id === activeId) {
          if (audio.paused) play();
          else audio.pause();
          sync();
        } else activate(track.id);
      });
      li.append(button);
      return li;
    }),
  );
  sync();
}
function sync() {
  const playing = activeId && !audio.paused;
  document.querySelectorAll(".track").forEach((button) => {
    const active = button.dataset.trackId === activeId,
      track = tracks.get(button.dataset.trackId);
    button.setAttribute("aria-current", String(active));
    button.setAttribute(
      "aria-label",
      `${active && playing ? "Pause" : "Play"} ${track.title}${track.explicit_status === "explicit" ? ", Explicit" : ""}`,
    );
    button.querySelector(".track-action").textContent =
      active && playing ? "Ⅱ" : "▷";
    button
      .querySelector(".track-index")
      .classList.toggle("is-playing", Boolean(active && playing));
  });
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");
  $("play-symbol").setAttribute("href", playing ? "#i-pause" : "#i-play");
  $("play").disabled = !activeId;
  $("shuffle").disabled = $("repeat").disabled = !activeId;
  $("previous").disabled = !activeId;
  $("next").disabled = !activeId || !queue.next({ shuffle, repeat });
  if (activeId) {
    const browsing = selectedCatalog()?.title;
    $("queue-context").textContent =
      `Queue: ${queue.title} · ${queue.ids.indexOf(activeId) + 1}/${queue.ids.length}${browsing && browsing !== queue.title ? ` · Browsing ${browsing}` : ""}`;
  }
}
function updatePosition() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0,
    position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  $("seek").max = duration;
  $("seek").value = position;
  $("seek").disabled = !duration;
  const time = (value) =>
    `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  $("elapsed").textContent = time(position);
  $("duration").textContent = time(duration);
  if (
    "mediaSession" in navigator &&
    navigator.mediaSession.setPositionState &&
    duration > 0
  )
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: audio.playbackRate,
        position: Math.min(duration, position),
      });
    } catch (error) {
      diagnostics.throttled("media_session", "position-update-failed", {
        error,
      });
      /* Optional capability. */
    }
}
function playbackState() {
  return {
    trackId: activeId,
    positionSeconds: audio.currentTime,
    durationSeconds: audio.duration,
    paused: audio.paused,
    ended: audio.ended,
    seeking: audio.seeking,
    readyState: audio.readyState,
    networkState: audio.networkState,
    queueLength: queue.ids.length,
    queueIndex: Math.max(0, queue.ids.indexOf(activeId)),
    shuffle,
    repeat,
  };
}
function recordPlayback(event, extra = {}) {
  diagnostics.event("playback", event, () => ({
    ...playbackState(),
    ...extra,
  }));
}
async function play() {
  if (!activeId) return;
  const operation = diagnostics.media.playRequested(
    activeId,
    tracks.get(activeId)?.mime,
  );
  try {
    recordPlayback("play-requested");
    await audio.play();
    recordPlayback("play-request-resolved");
    message();
  } catch (error) {
    recordPlayback("play-request-rejected", {
      error,
      media: diagnostics.media.failure(
        audio,
        tracks.get(activeId),
        operation,
        error,
      ),
    });
    message(
      "Playback could not start. Tap play to retry, or check your connection and sign-in.",
    );
  }
}
function activate(id, { autoplay = true, restart = false } = {}) {
  const track = tracks.get(id);
  if (!track) return;
  recordPlayback("activation-started", { nextTrackId: id });
  try {
    const previous = tracks.get(activeId),
      oldRoot = feedbackRoots.get(activeId),
      noteWasOpen = Boolean(oldRoot?.querySelector("dialog")?.open);
    const changed = activeId !== id;
    const sourceChanged = changed || !audio.getAttribute("src");
    activeId = id;
    queue.currentId = id;
    if (sourceChanged) {
      recordPlayback("source-change-initiated");
      diagnostics.media.sourceChange(id);
      audio.src = `/api/tracks/${encodeURIComponent(id)}/audio`;
      recordPlayback("source-assigned");
      recordPlayback("source-change-completed");
    } else if (restart) audio.currentTime = 0;
    // Request playback in this activation task, before presentation work. Do not
    // await the play promise: metadata/feedback must update even if it is pending.
    if (autoplay) play();
    if (sourceChanged) updatePosition();
    if (changed) oldRoot?.querySelector("dialog")?.close();
    $("now-title").textContent = track.title;
    $("now-artist").textContent = track.artist;
    $("now-explicit").hidden = track.explicit_status !== "explicit";
    $("artwork").onerror = () => {
      $("artwork").onerror = null;
      $("artwork").src = "/icon.svg";
      $("artwork").alt = "No track artwork";
    };
    $("artwork").src = track.artwork
      ? `/api/tracks/${id}/artwork`
      : "/icon.svg";
    $("artwork").alt = track.artwork
      ? `Artwork for ${track.title}`
      : "No track artwork";
    if (!feedbackRoots.has(id)) {
      const generation = sessionGeneration;
      feedbackRoots.set(
        id,
        trackFeedback(track, {
          api,
          liked: likes.get(id) || false,
          onLike: (value) => {
            if (generation === sessionGeneration) likes.set(id, value);
          },
          player: true,
        }),
      );
    }
    const root = feedbackRoots.get(id);
    root.dispatchEvent(
      new CustomEvent("feedback-state", { detail: likes.get(id) || false }),
    );
    if ($("active-feedback").firstChild !== root)
      $("active-feedback").replaceChildren(root);
    if (noteWasOpen && changed) {
      root.querySelector("[data-note-button]").click();
      root.dispatchEvent(
        new CustomEvent("feedback-context", {
          detail: `Draft for ${previous.title} kept for this session. You are now writing about ${track.title}.`,
        }),
      );
    }
    if ("mediaSession" in navigator && "MediaMetadata" in window) {
      diagnostics.event(
        "media_session",
        "metadata-update-started",
        playbackState,
      );
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          artwork: track.artwork
            ? [{ src: `/api/tracks/${id}/artwork` }]
            : [
                {
                  src:
                    config.assets.icon512 ||
                    config.assets.icon192 ||
                    "/branding/icon512",
                  sizes:
                    config.assets.icon512 || !config.assets.icon192
                      ? "512x512"
                      : "192x192",
                  type: "image/png",
                },
              ],
        });
        diagnostics.event("media_session", "metadata-updated", playbackState);
      } catch (error) {
        diagnostics.event("media_session", "metadata-update-failed", () => ({
          ...playbackState(),
          error,
        }));
        throw error;
      }
    }
    sync();
    recordPlayback("activation-completed");
  } catch (error) {
    diagnostics.event("application", "activation-failed", () => ({
      ...playbackState(),
      error,
    }));
    throw error;
  }
}
function advance(direction = 1, ended = false) {
  const id = queue.next({ direction, ended, shuffle, repeat });
  recordPlayback("next-track-selected", { nextTrackId: id });
  if (id) activate(id, { restart: true });
}
function previous() {
  if (audio.currentTime > 3) audio.currentTime = 0;
  else advance(-1);
}
const modes = {
  player: { button: "player-mode", view: "player-view" },
  store: { button: "store-mode", view: "store-view" },
};
function mode(name) {
  for (const [key, section] of Object.entries(modes)) {
    $(section.view).hidden = key !== name;
    $(section.button).setAttribute("aria-pressed", String(key === name));
  }
}
$("collection-filter").addEventListener("change", renderTracks);
$("player-mode").addEventListener("click", () => mode("player"));
$("store-mode").addEventListener("click", () => mode("store"));
$("return-player").addEventListener("click", () => mode("player"));
$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("auth-submit").disabled = true;
  message();
  try {
    await diagnostics.beforeAuthentication().catch(() => {});
    const data = await api(register ? "/api/register" : "/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("username").value,
        password: $("password").value,
        ...(register && $("invitation").value.trim()
          ? { invitation: $("invitation").value.trim() }
          : {}),
      }),
    });
    $("password").value = $("invitation").value = "";
    await signedIn(data);
  } catch (error) {
    message(error.message);
  } finally {
    $("auth-submit").disabled = false;
  }
});
$("auth-toggle").addEventListener("click", () => {
  register = !register;
  authMode();
  message();
});
$("logout").addEventListener("click", async () => {
  try {
    if (!(await diagnostics.prepareLogout())) return;
    await api("/api/logout", { method: "POST", body: "{}" });
    signedOut();
    message("Signed out.");
  } catch (error) {
    if (error.status === 401) signedOut();
    message(error.message);
  }
});
$("play").addEventListener("click", () =>
  audio.paused ? play() : (recordPlayback("pause-requested"), audio.pause()),
);
$("next").addEventListener("click", () => advance());
$("previous").addEventListener("click", previous);
$("shuffle").addEventListener("click", () => {
  shuffle = !shuffle;
  $("shuffle").setAttribute("aria-pressed", String(shuffle));
  sync();
});
$("repeat").addEventListener("click", () => {
  repeat = { off: "all", all: "one", one: "off" }[repeat];
  $("repeat").setAttribute("aria-label", `Repeat ${repeat}`);
  $("repeat").setAttribute("aria-pressed", String(repeat !== "off"));
  $("repeat-one").hidden = repeat !== "one";
  sync();
});
$("seek").addEventListener("input", () => {
  if (Number.isFinite(audio.duration))
    audio.currentTime = Number($("seek").value);
});
$("volume").addEventListener("input", () => {
  audio.volume = Number($("volume").value);
});
audio.addEventListener("ended", () => {
  recordPlayback("ended-received");
  advance(1, true);
  sync();
});
for (const event of ["play", "pause"])
  audio.addEventListener(event, () => {
    sync();
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = audio.paused
          ? "paused"
          : "playing";
        diagnostics.event(
          "media_session",
          "playback-state-updated",
          playbackState,
        );
      } catch (error) {
        diagnostics.event("media_session", "playback-state-failed", () => ({
          ...playbackState(),
          error,
        }));
        throw error;
      }
    }
  });
audio.addEventListener("error", () => {
  if (audio.getAttribute("src"))
    message(
      "Audio unavailable. Check your connection or sign in again, then select the track to retry.",
    );
});
for (const event of [
  "timeupdate",
  "loadedmetadata",
  "durationchange",
  "seeked",
])
  audio.addEventListener(event, updatePosition);
if ("mediaSession" in navigator) {
  const seek = (offset) => {
    if (Number.isFinite(audio.duration))
      audio.currentTime = Math.max(
        0,
        Math.min(audio.duration, audio.currentTime + offset),
      );
  };
  const actions = {
    play,
    pause: () => audio.pause(),
    previoustrack: previous,
    nexttrack: () => advance(),
    seekbackward: (details) => seek(-(details.seekOffset || 10)),
    seekforward: (details) => seek(details.seekOffset || 10),
    seekto: (details) => {
      if (Number.isFinite(details.seekTime) && Number.isFinite(audio.duration))
        audio.currentTime = Math.max(
          0,
          Math.min(audio.duration, details.seekTime),
        );
    },
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
    },
  };
  for (const [action, handler] of Object.entries(actions))
    try {
      navigator.mediaSession.setActionHandler(action, (details) => {
        diagnostics.event("media_session", `action-${action}`, playbackState);
        try {
          return handler(details);
        } catch (error) {
          diagnostics.event("media_session", "action-failed", () => ({
            ...playbackState(),
            error,
          }));
          throw error;
        }
      });
    } catch (error) {
      diagnostics.event("media_session", "action-registration-failed", {
        error,
      });
      /* Optional browser capability. */
    }
}
document.addEventListener("pointerdown", (event) => {
  if ($("account-menu").open && !$("account-menu").contains(event.target))
    $("account-menu").open = false;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $("account-menu").open = false;
});
$("about-button").addEventListener("click", () =>
  $("about-dialog").showModal(),
);
$("close-about").addEventListener("click", () => $("about-dialog").close());
let installPrompt;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  $("install").hidden = false;
});
$("install").addEventListener("click", async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
    $("install").hidden = true;
  }
});
window.addEventListener("appinstalled", () => {
  $("install").hidden = true;
});
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("/sw.js")
    .catch(() =>
      message(
        "App installation support is unavailable; browser playback still works.",
      ),
    );
for (const event of [
  "play",
  "playing",
  "pause",
  "ended",
  "waiting",
  "stalled",
  "suspend",
  "loadstart",
  "loadedmetadata",
  "canplay",
  "error",
  "seeking",
  "seeked",
  "abort",
  "emptied",
]) {
  audio.addEventListener(event, () =>
    recordPlayback(
      `audio-${event}`,
      audio.error
        ? {
            media: diagnostics.media.failure(audio, tracks.get(activeId)),
            mediaErrorCode: audio.error.code,
            error: { name: "MediaError", message: audio.error.message },
          }
        : ["loadedmetadata", "canplay"].includes(event)
          ? { media: diagnostics.media.snapshot(audio, tracks.get(activeId)) }
          : {},
    ),
  );
}
audio.addEventListener("timeupdate", () =>
  diagnostics.sample(audio, playbackState),
);
diagnostics.addEventListener("change", () => {
  $("diagnostics-link").textContent =
    diagnostics.state?.status === "recording"
      ? "Diagnostics · Recording"
      : "Diagnostics";
});
$("test-failed-media").addEventListener("click", () =>
  diagnostics.media.probe().catch((error) => message(error.message)),
);
diagnostics.addEventListener("change", () => {
  $("test-failed-media").hidden = !diagnostics.state?.failedMedia;
  $("test-failed-media").disabled = !diagnostics.media.canProbe();
});
async function boot() {
  try {
    const value = await api("/api/config");
    applyBranding(value);
    registrationAllowed = value.registration;
    authMode();
    try {
      await signedIn(await api("/api/me"));
    } catch (error) {
      if (error.status === 401) signedOut();
      else throw error;
    }
  } catch (error) {
    message(error.message);
  }
}
boot();
