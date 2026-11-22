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
// A browser-local preference only: no account data, device-setting detection or telemetry.
export function mountListeningTips(
  document,
  storage = () => window.localStorage,
) {
  const get = (id) => document.getElementById(id);
  const pane = get("listening-tips"),
    reminder = get("listening-tips-reminder");
  const opener = get("open-listening-tips"),
    status = get("listening-tips-status");
  const key = "musixene:listening-tips:hidden";
  let hidden = false,
    returnFocus = false;
  try {
    hidden = storage().getItem(key) === "true";
  } catch {
    /* Storage can be unavailable. */
  }
  reminder.checked = !hidden;
  function show(visible) {
    pane.hidden = !visible;
    pane.parentElement.classList.toggle("tips-open", visible);
  }
  function close() {
    const hadFocus = pane.contains(document.activeElement);
    show(false);
    if (returnFocus || hadFocus) {
      if (!opener.closest("[hidden]")) {
        get("account-menu").querySelector("summary").focus();
      } else get("auth-title").focus();
    }
    returnFocus = false;
  }
  function save(enabled) {
    try {
      storage().setItem(key, String(!enabled));
      hidden = !enabled;
      status.textContent = "";
      return true;
    } catch {
      reminder.checked = !hidden;
      status.textContent =
        "Couldn’t save this preference. Close will hide tips for this visit; they may appear again next launch.";
      return false;
    }
  }
  reminder.addEventListener("change", () => save(reminder.checked));
  get("close-listening-tips").addEventListener("click", close);
  get("hide-listening-tips").addEventListener("click", () => {
    if (save(false)) {
      reminder.checked = false;
      close();
    }
  });
  opener.addEventListener("click", () => {
    get("account-menu").open = false;
    returnFocus = true;
    show(true);
    get("listening-tips-title").focus();
  });
  pane.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  show(!hidden);
}
