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
import { test, expect } from "@playwright/test";
import { png } from "../png.js";
const origin = "http://localhost:3100";
async function adminLogin(page) {
  const response = await page.request.post("/api/login", {
    headers: { Origin: origin },
    data: { username: "browser-admin", password: "synthetic admin passphrase" },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

test("catalog and Store browsing preserve audio/queue; active feedback and drafts follow media actions safely", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.mediaActions = {};
    if (navigator.mediaSession) {
      const set = navigator.mediaSession.setActionHandler.bind(
        navigator.mediaSession,
      );
      navigator.mediaSession.setActionHandler = (name, fn) => {
        window.mediaActions[name] = fn;
        set(name, fn);
      };
    }
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "New here? Create a listener account" })
    .click();
  await page.getByLabel("Username", { exact: true }).fill("redesign-listener");
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic redesign passphrase");
  await page
    .getByRole("button", { name: "Create listener account", exact: true })
    .click();
  await expect(page.locator(".track")).toHaveCount(3);
  expect(
    await page.locator("#collection-filter option").allTextContents(),
  ).toEqual([
    "All Catalogs",
    "All Published Works",
    "All Unpublished Works",
    "Synthetic Pair",
    "Synthetic Non-Explicit",
  ]);
  await expect(page.locator("#now-explicit")).toBeVisible();
  await expect(
    page.locator(".track").first().locator(".explicit"),
  ).toBeVisible();
  await expect(page.locator("#tracks .track-feedback")).toHaveCount(0);
  await expect(page.locator("#active-feedback")).toHaveCount(1);
  await page.locator(".track").first().click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 0),
    )
    .toBe(true);
  await page.locator("audio").evaluate((a) => {
    a.currentTime = 6;
    window.originalAudio = a;
    window.audioReloads = 0;
    a.addEventListener("loadstart", () => window.audioReloads++);
  });
  const originalSrc = await page.locator("audio").getAttribute("src");
  await page
    .getByLabel("Catalog", { exact: true })
    .selectOption("system:published");
  await expect(page.locator(".track")).toHaveCount(2);
  await expect(page.locator("#now-title")).toHaveText("Morning signal");
  await page.getByRole("button", { name: "Store", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The store is on its way." }),
  ).toBeVisible();
  await expect(page.locator("#store-view")).toContainText(
    "no products or transactions",
  );
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate(
          (a) => !a.paused && a.currentTime >= 6 && a === window.originalAudio,
        ),
    )
    .toBe(true);
  expect(await page.evaluate(() => window.audioReloads)).toBe(0);
  expect(await page.locator("audio").getAttribute("src")).toBe(originalSrc);
  await page
    .getByRole("button", { name: "Back to Player", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Player", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "Credits Available", exact: true }),
  ).toHaveText("Credits AvailableComing Soon");
  await page
    .getByRole("button", { name: "Like Morning signal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Like Morning signal", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next track", exact: true }).click();
  await expect(page.locator("#now-title")).toHaveText("Small hours");
  await expect(page.locator(".track[aria-current=true]")).toHaveCount(0);
  await expect(page.locator("#queue-context")).toContainText(
    "Queue: All Catalogs",
  );
  await expect(
    page.getByRole("button", { name: "Like Small hours", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#now-explicit")).toBeHidden();
  await page
    .getByLabel("Catalog", { exact: true })
    .selectOption("synthetic-pair");
  await expect(page.locator(".track strong")).toHaveText([
    "Small hours",
    "Morning signal",
  ]);
  await page.locator(".track").first().click();
  if (await page.getByRole("button", { name: "Play", exact: true }).count())
    await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#queue-context")).toContainText(
    "Queue: Synthetic Pair",
  );
  await page.getByRole("button", { name: "Repeat off", exact: true }).click();
  await page.getByRole("button", { name: "Repeat all", exact: true }).click();
  await page
    .getByRole("button", { name: "Note to Artist", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Note to Artist — Small hours",
    exact: true,
  });
  await dialog.getByLabel("Your note").fill("A draft for Small hours only");
  await page.evaluate(() => window.mediaActions.nexttrack());
  dialog = page.getByRole("dialog", {
    name: "Note to Artist — Morning signal",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Your note")).toHaveValue("");
  await expect(dialog.getByRole("status")).toContainText(
    "You are now writing about Morning signal",
  );
  await expect(page.locator("#now-title")).toHaveText("Morning signal");
  await expect(
    page.locator("#active-feedback button[aria-pressed=true]"),
  ).toHaveText("Liked ♥");
  await page.evaluate(() => {
    window.mediaActions.seekto({ seekTime: 0 });
    window.mediaActions.previoustrack();
  });
  dialog = page.getByRole("dialog", {
    name: "Note to Artist — Small hours",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Your note")).toHaveValue(
    "A draft for Small hours only",
  );
  const activeId = await page.locator("audio").getAttribute("src");
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/notes") && r.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Send note", exact: true }).click();
  const posted = await request;
  expect(new URL(posted.url()).pathname).toBe(
    `/api/feedback/tracks/${activeId.split("/")[3]}/notes`,
  );
  expect(posted.postDataJSON().body).toBe("A draft for Small hours only");
  await expect(dialog.locator("li p")).toHaveText(
    "A draft for Small hours only",
  );
  await dialog
    .getByLabel("Your note")
    .fill("Draft stays open through repeat-one");
  await page.locator("audio").evaluate((a) => {
    a.currentTime = a.duration - 0.15;
  });
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => a.currentTime < 2 && !a.paused),
    )
    .toBe(true);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Your note")).toHaveValue(
    "Draft stays open through repeat-one",
  );
  await dialog.getByRole("button", { name: "Close note", exact: true }).click();
  expect(
    await page.evaluate(() => Object.keys(window.mediaActions).sort()),
  ).toEqual([
    "nexttrack",
    "pause",
    "play",
    "previoustrack",
    "seekbackward",
    "seekforward",
    "seekto",
    "stop",
  ]);
  expect(errors).toEqual([]);
});

test("hundreds of compact rows scroll independently while player/footer remain visible across responsive sizes", async ({
  page,
}) => {
  await adminLogin(page);
  await page.route("**/api/catalog", async (route) => {
    const response = await route.fetch(),
      data = await response.json(),
      first = data.tracks[0];
    data.tracks = [
      first,
      ...Array.from({ length: 239 }, (_, i) => ({
        ...first,
        id: `synthetic-${i}`,
        title: `Synthetic track ${i + 2}`,
        explicit_status: i % 3 === 0 ? "explicit" : "unreviewed",
        liked: 0,
      })),
    ];
    data.catalogs = [
      {
        id: "system:all",
        title: "All Catalogs",
        kind: "system",
        trackIds: data.tracks.map((t) => t.id),
      },
      {
        id: "system:published",
        title: "All Published Works",
        kind: "system",
        trackIds: [first.id],
      },
      {
        id: "system:unpublished",
        title: "All Unpublished Works",
        kind: "system",
        trackIds: [],
      },
    ];
    await route.fulfill({ response, json: data });
  });
  for (const [width, height] of [
    [390, 844],
    [360, 740],
    [768, 1024],
    [1280, 900],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".track")).toHaveCount(240);
    await expect(page.locator("#tracks .track-feedback")).toHaveCount(0);
    const before = await page.locator("#player").boundingBox();
    await page.locator("#track-scroll").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.locator(".track").last()).toBeInViewport();
    const after = await page.locator("#player").boundingBox();
    expect(after.y).toBe(before.y);
    const footer = await page.getByRole("contentinfo").boundingBox();
    expect(footer.y + footer.height).toBeLessThanOrEqual(height + 1);
    expect(before.y).toBeGreaterThanOrEqual(0);
    expect(before.height).toBeLessThan(400);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByLabel("Catalog", { exact: true })
      .selectOption("system:unpublished");
    await expect(page.locator("#empty")).toBeVisible();
    await expect(page.locator("#now-title")).toHaveText("Morning signal");
    await expect(
      page.getByRole("button", { name: "Like Morning signal", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Catalog", { exact: true }).focus();
    await expect(page.getByLabel("Catalog", { exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Store", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#store-view")).toBeVisible();
    await page.getByRole("button", { name: "Player", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#player-view")).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Catalog", { exact: true }).selectOption("system:all");
  await page.locator("#track-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: "/tmp/artist-player-mobile.png",
    fullPage: true,
  });
  // Simulate CSS safe-area values, not physical iOS/Android behavior.
  await page.route("**/theme.css", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) + ":root{--safe-top:44px;--safe-bottom:34px}",
    });
  });
  await page.reload();
  await expect(page.locator(".track")).toHaveCount(240);
  expect(
    await page
      .locator(".app-header")
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingTop)),
  ).toBe(44);
  expect(
    await page
      .getByRole("contentinfo")
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom)),
  ).toBeGreaterThanOrEqual(42);
  const notice = await page
    .getByRole("contentinfo")
    .locator(".attribution")
    .boundingBox();
  expect(notice.y + notice.height).toBeLessThanOrEqual(844 - 34);
});

test("administrator branding and classification/catalog forms persist without changing media access", async ({
  page,
}) => {
  const me = await adminLogin(page);
  await page.goto("/admin");
  await expect(page.locator("#administration")).toBeVisible();
  await page
    .getByLabel("Artist name", { exact: true })
    .fill("Synthetic Studio");
  await page
    .getByLabel("Header wordmark (optional)")
    .fill("Studio Listening Room");
  await page.getByLabel("Tagline (optional)").fill("");
  await page.getByLabel("PWA name (optional)").fill("Synthetic Studio Player");
  await page.getByLabel("PWA short name (optional)").fill("Studio");
  await page.getByLabel("Accent color", { exact: true }).fill("#223355");
  await page
    .locator("#settings-form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator("#admin-status")).toHaveText("Saved.");
  let asset = page
    .locator("#branding-assets details")
    .filter({ has: page.locator("summary", { hasText: "PWA icon" }) })
    .filter({ hasNot: page.locator("summary", { hasText: "Small" }) });
  await asset.locator("summary").click();
  await asset.getByLabel("Choose pwa icon", { exact: true }).setInputFiles({
    name: "synthetic-icon.png",
    mimeType: "image/png",
    buffer: png(512, 512),
  });
  await asset
    .getByRole("button", { name: "Upload pwa icon", exact: true })
    .click();
  await expect(page.locator("#admin-status")).toHaveText("Saved.");
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.name).toBe("Synthetic Studio Player");
  expect(manifest.short_name).toBe("Studio");
  expect(manifest.icons).toHaveLength(1);
  expect(manifest.icons[0].sizes).toBe("512x512");
  const card = page
    .locator("#track-list details")
    .filter({ has: page.locator("summary", { hasText: "Open horizon" }) });
  await card.locator("summary").click();
  await card
    .getByLabel("Release status", { exact: true })
    .selectOption("unpublished");
  await card
    .getByLabel("Explicit classification", { exact: true })
    .selectOption("non_explicit");
  await card.getByLabel("Content type", { exact: true }).fill("interview");
  await card.getByLabel("Genres (comma separated)").fill("Spoken");
  await card.getByLabel("Tags (comma separated)").fill("Synthetic");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  const create = page.locator("#collection-new");
  await create.getByLabel("Catalog title").fill("Synthetic Interviews");
  await create.getByLabel("Catalog available to listeners").check();
  await create.getByLabel("Catalog type").selectOption("dynamic");
  await create.getByLabel("Filter content type (optional)").fill("interview");
  await create.getByLabel("Match any tag (comma separated)").fill("synthetic");
  await create
    .getByRole("button", { name: "Create catalog", exact: true })
    .click();
  await expect(
    page
      .locator("#collection-list summary")
      .filter({ hasText: "Synthetic Interviews" }),
  ).toContainText("Dynamic");
  await page.goto("/");
  await expect(page.locator("#brand")).toHaveText("Studio Listening Room");
  await expect(
    page.getByRole("link", {
      name: "Synthetic Studio listening room home",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#tagline")).toBeHidden();
  const contrast = await page.locator("#play").evaluate((el) => {
    const css = getComputedStyle(el),
      luminance = (value) => {
        const [r, g, b] = value
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
    const a = luminance(css.color),
      b = luminance(css.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page
    .getByLabel("Catalog", { exact: true })
    .selectOption({ label: "Synthetic Interviews" });
  await expect(page.locator(".track strong")).toHaveText(["Open horizon"]);
  await page.locator(".track").click();
  await expect(page.locator("#now-title")).toHaveText("Open horizon");
  await expect(page.locator("#now-explicit")).toBeHidden();
  // Restore this shared synthetic fixture's classification so later independent regressions retain their baseline.
  const catalog = await (await page.request.get("/api/catalog")).json(),
    track = catalog.tracks.find((t) => t.title === "Open horizon");
  await page.request.post(`/api/admin/tracks/${track.id}`, {
    headers: { Origin: origin, "X-CSRF-Token": me.csrf },
    data: {
      title: track.title,
      artist: track.artist,
      visible: true,
      position: 0,
      release_status: "published",
      explicit_status: "unreviewed",
      content_type: "interview",
      genres: [],
      tags: [],
    },
  });
});
