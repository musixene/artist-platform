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
const fail = (message) => Object.assign(new Error(message), { status: 400 });
export const releaseStatuses = ["published", "unpublished"];
export const explicitStatuses = ["explicit", "non_explicit", "unreviewed"];
export function terms(value) {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some(
      (v) =>
        typeof v !== "string" ||
        !v.trim() ||
        [...v].length > 50 ||
        /[\u0000-\u001f]/.test(v),
    )
  )
    throw fail("Use at most 20 genre/tag names of 1–50 characters");
  const seen = new Set();
  return value
    .map((v) => v.trim())
    .filter((v) => {
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function metadata(
  data,
  record = {
    release_status: "unpublished",
    explicit_status: "unreviewed",
    content_type: "other",
    genres: "[]",
    tags: "[]",
  },
) {
  const release_status = data.release_status ?? record.release_status,
    explicit_status = data.explicit_status ?? record.explicit_status,
    content_type = data.content_type ?? record.content_type;
  if (
    !releaseStatuses.includes(release_status) ||
    !explicitStatuses.includes(explicit_status) ||
    typeof content_type !== "string" ||
    !/^[a-z][a-z0-9_]{0,39}$/.test(content_type)
  )
    throw fail(
      "Invalid release status, explicit classification or content type",
    );
  return {
    release_status,
    explicit_status,
    content_type,
    genres: terms(data.genres ?? JSON.parse(record.genres)),
    tags: terms(data.tags ?? JSON.parse(record.tags)),
  };
}
export function rules(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          "release_status",
          "explicit_status",
          "content_type",
          "genres_any",
          "tags_any",
        ].includes(k),
    )
  )
    throw fail("Unsupported catalog rules");
  const result = {};
  if (value.release_status) {
    if (!releaseStatuses.includes(value.release_status))
      throw fail("Invalid release rule");
    result.release_status = value.release_status;
  }
  if (value.explicit_status) {
    if (!explicitStatuses.includes(value.explicit_status))
      throw fail("Invalid explicit rule");
    result.explicit_status = value.explicit_status;
  }
  if (value.content_type) {
    if (
      typeof value.content_type !== "string" ||
      !/^[a-z][a-z0-9_]{0,39}$/.test(value.content_type)
    )
      throw fail("Invalid content-type rule");
    result.content_type = value.content_type;
  }
  for (const field of ["genres_any", "tags_any"])
    if (value[field] !== undefined) {
      const items = terms(value[field]);
      if (items.length) result[field] = items;
    }
  if (!Object.keys(result).length)
    throw fail("Choose at least one dynamic catalog filter");
  return result;
}
export function matches(track, filters) {
  for (const field of ["release_status", "explicit_status", "content_type"])
    if (filters[field] && track[field] !== filters[field]) return false;
  for (const [rule, field] of [
    ["genres_any", "genres"],
    ["tags_any", "tags"],
  ])
    if (
      filters[rule]?.length &&
      !filters[rule].some((v) =>
        track[field].some((t) => t.toLowerCase() === v.toLowerCase()),
      )
    )
      return false;
  return true;
}
export const decodeTrack = (track) => ({
  ...track,
  genres: JSON.parse(track.genres),
  tags: JSON.parse(track.tags),
});
export function listenerTracks(db, userId) {
  return db
    .prepare(
      `SELECT id,title,artist,mime,artwork,release_status,explicit_status,content_type,genres,tags,
    EXISTS(SELECT 1 FROM track_likes WHERE track_id=tracks.id AND user_id=?) AS liked
    FROM tracks WHERE visible=1 ORDER BY position,created_at,id`,
    )
    .all(userId)
    .map(decodeTrack);
}
export function listenerCollections(db, tracks) {
  const available = new Map(tracks.map((t) => [t.id, t]));
  return db
    .prepare("SELECT * FROM collections WHERE visible=1 ORDER BY position,id")
    .all()
    .map((c) => {
      const filters = JSON.parse(c.rules);
      const members =
        c.kind === "dynamic"
          ? tracks.filter((t) => matches(t, filters))
          : db
              .prepare(
                "SELECT track_id FROM collection_tracks WHERE collection_id=? ORDER BY position",
              )
              .all(c.id)
              .map((t) => available.get(t.track_id))
              .filter(Boolean);
      return { ...c, rules: filters, tracks: members };
    });
}
export function catalog(db, userId) {
  const tracks = listenerTracks(db, userId);
  const system = [
    ["all", "All Catalogs", tracks],
    [
      "published",
      "All Published Works",
      tracks.filter((t) => t.release_status === "published"),
    ],
    [
      "unpublished",
      "All Unpublished Works",
      tracks.filter((t) => t.release_status === "unpublished"),
    ],
  ];
  return {
    tracks,
    catalogs: [
      ...system.map(([id, title, items]) => ({
        id: `system:${id}`,
        title,
        kind: "system",
        trackIds: items.map((t) => t.id),
      })),
      ...listenerCollections(db, tracks).map((c) => ({
        id: c.id,
        title: c.title,
        kind: c.kind,
        trackIds: c.tracks.map((t) => t.id),
      })),
    ],
  };
}
