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
// Queue policy is independent of DOM/audio and accounting.
export function nextIndex({
  length,
  current,
  direction = 1,
  shuffle = false,
  repeat = "off",
  ended = false,
  random = Math.random,
}) {
  if (!length) return -1;
  if (current < 0) return 0;
  if (ended && repeat === "one") return current;
  if (shuffle && length > 1) {
    const other = Math.min(length - 2, Math.floor(random() * (length - 1)));
    return other >= current ? other + 1 : other;
  }
  const next = current + direction;
  if (next >= 0 && next < length) return next;
  return repeat === "all" ? (next + length) % length : -1;
}

// Browsing never changes this snapshot. An explicit selection establishes a new queue.
export class PlaybackQueue {
  constructor() {
    this.ids = [];
    this.title = "All Catalogs";
    this.currentId = null;
  }
  select(ids, id, title) {
    this.ids = [...new Set(ids)];
    this.currentId = id;
    this.title = title;
  }
  next(options = {}) {
    const index = nextIndex({
      length: this.ids.length,
      current: this.ids.indexOf(this.currentId),
      ...options,
    });
    return index < 0 ? null : this.ids[index];
  }
}
