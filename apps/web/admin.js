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
import { mountFeedbackAdmin } from "./feedback-ui.js";
const $ = (id) => document.getElementById(id);
let csrf = "",
  state,
  saving = false;
function el(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function status(text) {
  $("admin-status").textContent = text;
}
async function api(path, data, file) {
  const response = await fetch(path, {
    credentials: "same-origin",
    method: data === undefined && !file ? "GET" : "POST",
    headers: {
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(file
        ? { "Content-Type": file.type || "application/octet-stream" }
        : data !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
    },
    body: file || (data === undefined ? undefined : JSON.stringify(data)),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
function field(parent, label, value = "", type = "text") {
  const wrapper = el("label", label),
    input = el("input");
  input.type = type;
  if (type === "checkbox") input.checked = Boolean(value);
  else input.value = value;
  if (type === "number") {
    input.min = 0;
    input.max = 1000000;
    input.step = 1;
  }
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
function select(parent, label, values, value) {
  const wrapper = el("label", label),
    input = el("select");
  input.setAttribute("aria-label", label);
  for (const [id, text] of values) {
    const option = el("option", text);
    option.value = id;
    input.append(option);
  }
  input.value = value;
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
function group(parent, label) {
  const fieldset = el("fieldset");
  fieldset.append(el("legend", label));
  parent.append(fieldset);
  return fieldset;
}
function help(parent, text) {
  const node = el("p", text);
  node.className = "help";
  parent.append(node);
}
function button(parent, label, action) {
  const b = el("button", label);
  b.type = "button";
  b.addEventListener("click", () => run(action, b));
  parent.append(b);
  return b;
}
async function run(action, b) {
  if (saving) return;
  saving = true;
  $("administration").disabled = true;
  $("administration").inert = true;
  $("administration").setAttribute("aria-busy", "true");
  if (b) b.disabled = true;
  status("Saving…");
  try {
    await action();
    status("Saved.");
  } catch (error) {
    status(error.message);
  } finally {
    saving = false;
    $("administration").disabled = false;
    $("administration").inert = false;
    $("administration").setAttribute("aria-busy", "false");
    if (b) b.disabled = false;
  }
}
function form(parent, save, label = "Save") {
  const f = el("form"),
    submit = el("button", label);
  submit.type = "submit";
  f.addEventListener("submit", (event) => {
    event.preventDefault();
    run(save, submit);
  });
  parent.append(f);
  return {
    f,
    finish() {
      f.append(submit);
    },
  };
}
async function refresh() {
  state = await api("/api/admin/state");
  render();
}
const releaseOptions = [
  ["unpublished", "Unpublished"],
  ["published", "Published"],
];
const explicitOptions = [
  ["unreviewed", "Unreviewed / Unclassified"],
  ["non_explicit", "Non-Explicit"],
  ["explicit", "Explicit"],
];
const splitTerms = (value) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
function render() {
  mountFeedbackAdmin(
    $("feedback"),
    (path, options = {}) =>
      api(
        path,
        options.body === undefined ? undefined : JSON.parse(options.body),
      ),
    state,
  );
  for (const id of [
    "settings-form",
    "branding-assets",
    "invite-form",
    "invite-list",
    "listener-list",
    "track-form",
    "track-list",
    "collection-new",
    "collection-list",
  ])
    $(id).replaceChildren();
  renderSettings();
  renderInvitations();
  renderUsers();
  renderTracks();
  collectionForm($("collection-new"));
  for (const collection of state.collections) {
    const card = el("details");
    card.append(
      el(
        "summary",
        `${collection.title} · ${collection.kind === "dynamic" ? "Dynamic" : "Curated"} · ${collection.visible ? "Available" : "Hidden"}`,
      ),
    );
    $("collection-list").append(card);
    collectionForm(card, collection);
  }
}
function renderSettings() {
  const settings = form($("settings-form"), async () => {
    await api("/api/admin/settings", {
      name: name.value,
      tagline: tagline.value,
      wordmark: wordmark.value,
      pwaName: pwaName.value,
      pwaShortName: shortName.value,
      accent: accent.value,
      registration: registration.checked,
    });
    await refresh();
  });
  const identity = group(settings.f, "Artist identity");
  const name = field(identity, "Artist name", state.settings.name),
    wordmark = field(
      identity,
      "Header wordmark (optional)",
      state.settings.wordmark || "",
    ),
    tagline = field(identity, "Tagline (optional)", state.settings.tagline);
  name.required = true;
  name.maxLength = wordmark.maxLength = 100;
  tagline.maxLength = 200;
  help(
    identity,
    "Your artist name is the fallback wordmark. A logo can replace it; Musixene is the software developer, not the artist.",
  );
  const pwa = group(settings.f, "Installed app");
  const pwaName = field(
      pwa,
      "PWA name (optional)",
      state.settings.pwaName || "",
    ),
    shortName = field(
      pwa,
      "PWA short name (optional)",
      state.settings.pwaShortName || "",
    );
  pwaName.maxLength = 100;
  shortName.maxLength = 30;
  help(
    pwa,
    "Blank names use your artist name. Existing installed apps may need a browser update or reinstallation to adopt new icons/names.",
  );
  const accent = field(
      settings.f,
      "Accent color",
      state.settings.accent,
      "color",
    ),
    registration = field(
      settings.f,
      "Allow public signup (unchecked means invite-only)",
      state.settings.registration,
      "checkbox",
    );
  settings.finish();
  for (const [kind, label, requirement] of [
    ["logo", "Header logo", "64–2048 pixels wide, 32–1024 high"],
    ["favicon", "Browser favicon", "square, 32–256 pixels"],
    ["icon512", "PWA icon", "512×512 pixels"],
    ["icon192", "Small PWA icon", "192×192 pixels"],
  ]) {
    const card = el("details");
    card.append(el("summary", label));
    $("branding-assets").append(card);
    help(
      card,
      `PNG only, non-interlaced 8-bit RGB/RGBA, up to 2 MiB; ${requirement}. Generic fallbacks are used when absent. Files are validated on the server.`,
    );
    if (state.settings[kind]) {
      const image = el("img");
      image.src = `/branding/${kind}?v=${encodeURIComponent(state.settings[kind])}`;
      image.alt = label;
      image.width = 100;
      card.append(image);
      button(card, `Use default ${label.toLowerCase()}`, async () => {
        await api(`/api/admin/branding/${kind}/clear`, {});
        await refresh();
      });
    }
    const upload = form(
      card,
      async () => {
        if (!file.files[0]) throw new Error("Choose a PNG");
        await api(`/api/admin/branding/${kind}`, undefined, file.files[0]);
        await refresh();
      },
      `Upload ${label.toLowerCase()}`,
    );
    const file = field(upload.f, `Choose ${label.toLowerCase()}`, "", "file");
    file.accept = "image/png";
    file.required = true;
    upload.finish();
  }
}
function renderInvitations() {
  const invite = form(
    $("invite-form"),
    async () => {
      const result = await api("/api/admin/invitations", {
        username: bound.value,
        hours: Number(hours.value),
      });
      $("invite-token").textContent =
        `Invitation token (copy now): ${result.token} — expires ${new Date(result.expiresAt).toLocaleString()}`;
      await refresh();
    },
    "Create invitation",
  );
  const bound = field(invite.f, "Restrict to username (optional)"),
    hours = field(invite.f, "Expires in hours (1–720)", 72, "number");
  hours.min = 1;
  hours.max = 720;
  invite.finish();
  for (const invitation of state.invitations) {
    const row = el(
      "p",
      `${invitation.username || "Any new username"} · ${invitation.used_at ? "Used" : invitation.expires_at <= Date.now() ? "Expired / revoked" : `Expires ${new Date(invitation.expires_at).toLocaleString()}`}`,
    );
    if (!invitation.used_at && invitation.expires_at > Date.now())
      button(row, "Revoke", async () => {
        await api(`/api/admin/invitations/${invitation.id}/revoke`, {});
        await refresh();
      });
    $("invite-list").append(row);
  }
}
function renderUsers() {
  for (const user of state.users) {
    const card = el("details");
    card.append(
      el(
        "summary",
        `${user.username} · ${user.role}${user.disabled ? " · disabled" : ""}`,
      ),
    );
    $("listener-list").append(card);
    const edit = form(card, async () => {
      await api(`/api/admin/users/${user.id}`, {
        role: role.value,
        disabled: disabled.checked,
        ...(password.value ? { password: password.value } : {}),
      });
      password.value = "";
      await refresh();
    });
    const role = select(
        edit.f,
        "Role",
        [
          ["listener", "Listener"],
          ["administrator", "Administrator"],
        ],
        user.role,
      ),
      disabled = field(edit.f, "Disable account", user.disabled, "checkbox"),
      password = field(
        edit.f,
        "New password (leave empty to keep current)",
        "",
        "password",
      );
    password.autocomplete = "new-password";
    password.minLength = 12;
    password.maxLength = 128;
    edit.finish();
  }
}
function renderTracks() {
  const create = form(
    $("track-form"),
    async () => {
      await api("/api/admin/tracks", {
        title: title.value,
        artist: artist.value,
      });
      await refresh();
    },
    "Create draft",
  );
  const title = field(create.f, "Track title"),
    artist = field(create.f, "Artist", state.settings.name);
  title.required = artist.required = true;
  title.maxLength = 200;
  artist.maxLength = 100;
  create.finish();
  for (const track of state.tracks) {
    const card = el("details");
    card.dataset.trackId = track.id;
    card.append(
      el(
        "summary",
        `${track.position}. ${track.title} · ${track.visible ? "Available" : "Hidden"}`,
      ),
    );
    $("track-list").append(card);
    if (track.artwork) {
      const image = el("img");
      image.src = `/api/tracks/${track.id}/artwork`;
      image.alt = `Artwork for ${track.title}`;
      image.width = 120;
      card.append(image);
    }
    const edit = form(card, async () => {
      await api(`/api/admin/tracks/${track.id}`, {
        title: title.value,
        artist: artist.value,
        visible: visible.checked,
        position: Number(order.value),
        removeArtwork: remove.checked,
        release_status: release.value,
        explicit_status: explicit.value,
        content_type: type.value,
        genres: splitTerms(genres.value),
        tags: splitTerms(tags.value),
      });
      await refresh();
    });
    const info = group(edit.f, "Track Details");
    const title = field(info, "Title", track.title),
      artist = field(info, "Artist", track.artist),
      visible = field(
        info,
        "Available to listeners",
        track.visible,
        "checkbox",
      ),
      order = field(info, "Position", track.position, "number"),
      remove = field(info, "Remove artwork", false, "checkbox");
    title.required = artist.required = true;
    title.maxLength = 200;
    artist.maxLength = 100;
    help(
      info,
      "Availability controls listening-room access. Hidden tracks remain inaccessible through direct media URLs.",
    );
    const classification = group(edit.f, "Classification");
    const release = select(
        classification,
        "Release status",
        releaseOptions,
        track.release_status,
      ),
      explicit = select(
        classification,
        "Explicit classification",
        explicitOptions,
        track.explicit_status,
      ),
      type = field(classification, "Content type", track.content_type),
      genres = field(
        classification,
        "Genres (comma separated)",
        track.genres.join(", "),
      ),
      tags = field(
        classification,
        "Tags (comma separated)",
        track.tags.join(", "),
      );
    type.setAttribute("list", "content-types");
    type.pattern = "[a-z][a-z0-9_]{0,39}";
    type.required = true;
    help(
      classification,
      "Release status is your designation, independent of availability; it is not a legal copyright-publication determination. New metadata defaults to Unpublished / Other / Unreviewed. Content types can be extended with lowercase identifiers. Genres and tags allow up to 20 names, 50 characters each.",
    );
    edit.finish();
    for (const kind of ["audio", "artwork"]) {
      const upload = form(
        card,
        async () => {
          if (!file.files[0]) throw new Error("Choose a file");
          await api(
            `/api/admin/tracks/${track.id}/${kind}`,
            undefined,
            file.files[0],
          );
          await refresh();
        },
        `Upload ${kind}`,
      );
      const file = field(upload.f, `Choose ${kind}`, "", "file");
      file.required = true;
      file.accept =
        kind === "audio" ? ".wav,.mp3,.m4a,.ogg" : ".png,.jpg,.jpeg";
      upload.finish();
    }
  }
}
function collectionForm(
  parent,
  collection = {
    title: "",
    visible: 0,
    position: 0,
    kind: "curated",
    rules: {},
    trackIds: [],
  },
) {
  let trackIds = [...collection.trackIds];
  const filters = collection.rules;
  const edit = form(
    parent,
    async () => {
      await api("/api/admin/collections", {
        id: collection.id,
        title: title.value,
        visible: visible.checked,
        position: Number(order.value),
        kind: kind.value,
        trackIds,
        rules: {
          ...(release.value ? { release_status: release.value } : {}),
          ...(explicit.value ? { explicit_status: explicit.value } : {}),
          ...(type.value ? { content_type: type.value } : {}),
          genres_any: splitTerms(genres.value),
          tags_any: splitTerms(tags.value),
        },
      });
      await refresh();
    },
    collection.id ? "Save catalog" : "Create catalog",
  );
  const title = field(edit.f, "Catalog title", collection.title),
    visible = field(
      edit.f,
      "Catalog available to listeners",
      collection.visible,
      "checkbox",
    ),
    order = field(edit.f, "Position", collection.position, "number"),
    kind = select(
      edit.f,
      "Catalog type",
      [
        ["curated", "Curated — ordered track selection"],
        ["dynamic", "Dynamic — metadata filters"],
      ],
      collection.kind,
    );
  title.required = true;
  title.maxLength = 200;
  kind.disabled = Boolean(collection.id);
  const curated = group(edit.f, "Curated membership");
  const selection = select(
      curated,
      "Add track",
      state.tracks.map((t) => [t.id, t.title]),
      state.tracks[0]?.id || "",
    ),
    list = el("ol");
  function draw() {
    list.replaceChildren();
    trackIds.forEach((id, i) => {
      const row = el("li", state.tracks.find((t) => t.id === id)?.title || id);
      button(row, "Move up", () => {
        if (i > 0)
          [trackIds[i - 1], trackIds[i]] = [trackIds[i], trackIds[i - 1]];
        draw();
      });
      button(row, "Move down", () => {
        if (i < trackIds.length - 1)
          [trackIds[i + 1], trackIds[i]] = [trackIds[i], trackIds[i + 1]];
        draw();
      });
      button(row, "Remove", () => {
        trackIds.splice(i, 1);
        draw();
      });
      list.append(row);
    });
  }
  button(curated, "Add track", () => {
    if (selection.value && !trackIds.includes(selection.value))
      trackIds.push(selection.value);
    draw();
  });
  curated.append(list);
  draw();
  const dynamic = group(edit.f, "Dynamic filters");
  const release = select(
      dynamic,
      "Filter release status",
      [["", "Any release status"], ...releaseOptions],
      filters.release_status || "",
    ),
    explicit = select(
      dynamic,
      "Filter explicit classification",
      [["", "Any classification"], ...explicitOptions],
      filters.explicit_status || "",
    ),
    type = field(
      dynamic,
      "Filter content type (optional)",
      filters.content_type || "",
    ),
    genres = field(
      dynamic,
      "Match any genre (comma separated)",
      (filters.genres_any || []).join(", "),
    ),
    tags = field(
      dynamic,
      "Match any tag (comma separated)",
      (filters.tags_any || []).join(", "),
    );
  type.setAttribute("list", "content-types");
  help(
    dynamic,
    "Choose at least one filter. Different fields must all match; within genres or tags, any listed value matches (case-insensitive). Non-Explicit excludes Unreviewed. Hidden tracks are always excluded. Order follows track positions.",
  );
  const update = () => {
    curated.hidden = kind.value !== "curated";
    dynamic.hidden = kind.value !== "dynamic";
  };
  kind.addEventListener("change", update);
  update();
  edit.finish();
  if (collection.id)
    button(parent, "Delete catalog", async () => {
      await api(`/api/admin/collections/${collection.id}/delete`, {});
      await refresh();
    });
}
try {
  const me = await api("/api/me");
  csrf = me.csrf;
  if (me.user.role !== "administrator")
    throw new Error(
      "Administrator access required. Sign in with an administrator account in the listening room.",
    );
  await refresh();
  $("administration").hidden = false;
  status("Ready.");
} catch (error) {
  status(error.message);
}
