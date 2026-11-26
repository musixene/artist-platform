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
import { expect } from "@playwright/test";
import { test, login } from "./diagnostics-fixture.js";
import { png } from "../png.js";
async function post(page, app, auth, path, data) {
  const r = await page.request.post(app.url + path, {
    headers: { Origin: app.url, "X-CSRF-Token": auth.csrf },
    data,
  });
  expect(r.ok()).toBe(true);
  return r.json();
}
const body = (text) => [{ type: "paragraph", children: [{ text }] }];
async function article(page, app, auth, title, prominence = "normal") {
  let row = (
    await post(page, app, auth, "/api/admin/articles", {
      title,
      body: body("Synthetic private editorial text."),
    })
  ).article;
  row = (
    await post(page, app, auth, `/api/admin/articles/${row.id}/publish`, {
      revision: row.revision,
    })
  ).article;
  if (prominence !== "normal")
    row = (
      await post(page, app, auth, `/api/admin/articles/${row.id}/prominence`, {
        revision: row.revision,
        prominence,
      })
    ).article;
  return row;
}
test("four sections preserve native audio, queue, accounting and private feedback while Blog and Social remain one-way", async ({
  page,
  app,
}) => {
  const admin = await login(page, app);
  const row = await article(page, app, admin, "Artist dispatch", "top");
  await article(page, app, admin, "Pinned field notes", "pin");
  await article(page, app, admin, "A quiet reflection");
  await post(page, app, admin, "/api/admin/social", {
    label: "Artist Instagram",
    url: "https://www.instagram.com/example_artist/",
    platform: "instagram",
    position: 0,
    enabled: true,
  });
  await login(page, app, "listener");
  await page.goto(app.url);
  await page
    .getByRole("button", { name: "Don’t show again", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "App sections" });
  await expect(nav.getByRole("button")).toHaveText([
    "Player",
    "Blog",
    "Social",
    "Store",
  ]);
  await expect(page.locator("#player-mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(0.1);
  const before = await page.locator("audio").evaluate((a) => {
    window.originalAudio = a;
    return { src: a.currentSrc, time: a.currentTime };
  });
  const balance = app.db
    .prepare("SELECT id,credit_units FROM users ORDER BY id")
    .all();
  await page.getByRole("button", { name: "Blog", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Artist dispatch", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Artist dispatch", exact: true })
    .click();
  await expect(page.locator("#blog-content .article-reader")).toContainText(
    "Synthetic private editorial text.",
  );
  await expect(page.locator("#blog-content time")).toContainText("UTC");
  await expect(page.locator('#blog-content [data-symbol="star"]')).toHaveCount(
    1,
  );
  await expect(page.locator('#blog-content [data-symbol="pin"]')).toHaveCount(
    0,
  );
  await expect(page.locator("#blog-content")).not.toContainText("Created:");
  expect(
    await page.locator("#blog-content").locator("audio,video,iframe").count(),
  ).toBe(0);
  expect(
    await page
      .locator("#blog-content")
      .getByRole("button", { name: /like|comment|share|note/i })
      .count(),
  ).toBe(0);
  await page
    .getByRole("button", { name: "← Back to Blog", exact: true })
    .click();
  await page.getByRole("button", { name: "Social", exact: true }).focus();
  await page.keyboard.press("Space");
  const link = page.getByRole("link", {
    name: "Artist Instagram (opens in a new tab)",
    exact: true,
  });
  await expect(link).toHaveAttribute(
    "href",
    "https://www.instagram.com/example_artist/",
  );
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByRole("button", { name: "Store", exact: true }).click();
  await expect(page.locator("#store-view")).toContainText("Coming Soon");
  await page.getByRole("button", { name: "Player", exact: true }).click();
  const after = await page.locator("audio").evaluate((a) => ({
    same: a === window.originalAudio,
    src: a.currentSrc,
    time: a.currentTime,
    paused: a.paused,
  }));
  expect(after.same).toBe(true);
  expect(after.src).toBe(before.src);
  expect(after.time).toBeGreaterThan(before.time);
  expect(after.paused).toBe(false);
  expect(
    app.db.prepare("SELECT id,credit_units FROM users ORDER BY id").all(),
  ).toEqual(balance);
  expect(
    app.db.prepare("SELECT count(*) AS n FROM credit_ledger").get().n,
  ).toBe(0);
  expect(
    app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
  ).toBe(0);
  await page.getByRole("button", { name: "Blog", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Artist dispatch", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/editorial-blog-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: "/tmp/editorial-blog-desktop.png" });
  await page.getByRole("button", { name: "Social", exact: true }).click();
  await expect(link).toBeVisible();
  await page.screenshot({ path: "/tmp/editorial-social-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/editorial-social-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("artist writes formatted drafts, previews privately, uploads images and publishes with UTC dates; content edits preserve publication", async ({
  page,
  app,
}) => {
  const auth = await login(page, app);
  await page.goto(app.url + "/admin");
  const root = page.locator("#articles");
  await root
    .getByRole("button", { name: "Create article", exact: true })
    .click();
  await root.getByLabel("Article title", { exact: true }).fill("Photo journal");
  await root
    .getByRole("textbox", { name: "Article body", exact: true })
    .fill("A private reflection with emphasis.");
  await root.getByRole("textbox", { name: "Article body" }).evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await root.getByRole("button", { name: "Bold", exact: true }).click();
  await root.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(root.getByRole("status")).toContainText("Draft saved");
  let row = app.db
    .prepare("SELECT * FROM articles WHERE title=?")
    .get("Photo journal");
  expect(JSON.parse(row.body)[0].children.some((i) => i.bold)).toBe(true);
  expect(row.published_at).toBe(null);
  await root
    .getByRole("button", { name: "Preview article", exact: true })
    .click();
  const preview = page.getByRole("dialog", {
    name: "Private article preview",
    exact: true,
  });
  await expect(preview).toContainText("Private draft preview");
  await expect(preview.locator("strong")).toContainText("A private reflection");
  await preview
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await root.getByLabel("Choose article image", { exact: true }).setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: png(64, 64),
  });
  await root
    .getByRole("button", { name: "Upload article image", exact: true })
    .click();
  await expect(root.getByRole("status")).toContainText(
    "Private image uploaded",
  );
  await root
    .getByLabel("Image description (empty means decorative)", { exact: true })
    .fill("Synthetic colored square");
  await root
    .getByLabel("Image caption", { exact: true })
    .fill("A synthetic test image");
  await root
    .getByRole("button", { name: "Save image details", exact: true })
    .click();
  await expect(root.getByRole("status")).toContainText("Image details saved");
  await root
    .getByRole("button", { name: "Publish article", exact: true })
    .click();
  await expect(root.getByRole("status")).toContainText("Article published");
  row = app.db.prepare("SELECT * FROM articles WHERE id=?").get(row.id);
  expect(row.updated_at).toBe(row.published_at);
  const publication = row.published_at;
  await root
    .getByRole("textbox", { name: "Article body" })
    .fill("Revised private reflection.");
  await root.getByRole("button", { name: "Save article", exact: true }).click();
  await expect(root.getByRole("status")).toContainText("Article content saved");
  row = app.db.prepare("SELECT * FROM articles WHERE id=?").get(row.id);
  expect(row.published_at).toBe(publication);
  expect(row.updated_at).toBeGreaterThan(publication);
  await login(page, app, "listener");
  await page.goto(app.url);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Blog", exact: true }).click();
  await page
    .getByRole("button", { name: "Photo journal", exact: true })
    .click();
  await expect(page.locator(".article-dates")).toContainText("Published:");
  await expect(page.locator(".article-dates")).toContainText("Updated:");
  await expect(
    page.getByRole("img", { name: "Synthetic colored square", exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(app.url + "/api/admin/articles/" + row.id)
    ).status(),
  ).toBe(403);
  const cacheKeys = await page.evaluate(async () => {
    const entries = [];
    for (const name of await caches.keys())
      for (const r of await (await caches.open(name)).keys())
        entries.push(r.url);
    return entries;
  });
  expect(cacheKeys.some((url) => url.includes("/api/blog"))).toBe(false);
  await page.screenshot({ path: "/tmp/editorial-article-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/editorial-article-mobile.png" });
});
test("Top Pin conflict dialog offers exactly the three required choices; cancel, standard pin and replacement preserve chronology", async ({
  page,
  app,
}) => {
  const auth = await login(page, app);
  let existing = await article(page, app, auth, "Tour announcement", "top");
  let candidate = await article(page, app, auth, "New essay");
  await page.goto(app.url + "/admin");
  const root = page.locator("#articles");
  await root
    .getByRole("button", { name: "New essay · Published", exact: true })
    .click();
  await root.getByRole("button", { name: "Top Pin", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Top Pin already assigned",
    exact: true,
  });
  await expect(dialog).toContainText("Tour announcement");
  await expect(dialog.getByRole("button")).toHaveText([
    "Replace Top Pin",
    "Standard Pin Instead",
    "Cancel, I Changed My Mind",
  ]);
  const before = app.db.prepare("SELECT * FROM articles ORDER BY id").all();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: "/tmp/editorial-top-conflict-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/editorial-top-conflict-mobile.png" });
  await dialog
    .getByRole("button", { name: "Cancel, I Changed My Mind", exact: true })
    .click();
  expect(app.db.prepare("SELECT * FROM articles ORDER BY id").all()).toEqual(
    before,
  );
  await root.getByRole("button", { name: "Top Pin", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Standard Pin Instead", exact: true })
    .click();
  await expect(root.getByRole("status")).toContainText(
    "Existing Top Pin unchanged",
  );
  expect(
    app.db
      .prepare("SELECT prominence FROM articles WHERE id=?")
      .get(candidate.id).prominence,
  ).toBe("pin");
  await root.getByRole("button", { name: "Top Pin", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Replace Top Pin", exact: true })
    .click();
  await expect(root.getByRole("status")).toContainText(
    "previous article remains a standard Pin",
  );
  expect(
    app.db
      .prepare("SELECT prominence FROM articles WHERE id=?")
      .get(existing.id).prominence,
  ).toBe("pin");
  const updated = app.db
    .prepare("SELECT * FROM articles WHERE id=?")
    .get(candidate.id);
  expect(updated.prominence).toBe("top");
  expect(updated.published_at).toBe(candidate.published_at);
  expect(updated.updated_at).toBe(candidate.updated_at);
  await root.getByRole("button", { name: "Top Pin", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await root
    .getByRole("button", { name: "Unpublish article", exact: true })
    .click();
  await expect(root.getByRole("status")).toContainText("unpublished");
  await root
    .getByRole("button", { name: "Republish article", exact: true })
    .click();
  await expect(root.getByRole("status")).toContainText("published");
  expect(
    app.db
      .prepare("SELECT prominence FROM articles WHERE id=?")
      .get(candidate.id).prominence,
  ).toBe("pin");
});
test("artist manages social labels, icon, order, enabled state and removal without embeds", async ({
  page,
  app,
}) => {
  await login(page, app);
  await page.goto(app.url + "/admin");
  const root = page.locator("#social-links");
  await root.getByText("Add social profile", { exact: true }).click();
  await root.getByLabel("Social label", { exact: true }).fill("Artist channel");
  await root
    .getByLabel("Social HTTPS URL", { exact: true })
    .fill("https://www.youtube.com/@example_artist");
  await root
    .getByLabel("Platform icon", { exact: true })
    .selectOption("youtube");
  await root.getByLabel("Show social link", { exact: true }).check();
  await root
    .getByRole("button", { name: "Add social link", exact: true })
    .click();
  await expect(root.getByRole("status")).toContainText("saved");
  await expect(root).not.toHaveAttribute("aria-busy", "true");
  const card = root
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Artist channel" }) });
  await card.locator("summary").click();
  await card.getByLabel("Social label", { exact: true }).fill("Artist videos");
  await card.getByLabel("Social position", { exact: true }).fill("5");
  await card
    .getByRole("button", { name: "Save social link", exact: true })
    .click();
  await expect
    .poll(() => app.db.prepare("SELECT label FROM social_links").get().label)
    .toBe("Artist videos");
  await expect(root).not.toHaveAttribute("aria-busy", "true");
  await root.getByText("5. Artist videos · Enabled", { exact: true }).click();
  const edit = root
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Artist videos" }) });
  await edit.getByLabel("Show social link", { exact: true }).uncheck();
  await edit
    .getByRole("button", { name: "Save social link", exact: true })
    .click();
  await expect
    .poll(
      () => app.db.prepare("SELECT enabled FROM social_links").get().enabled,
    )
    .toBe(0);
  await expect(root).not.toHaveAttribute("aria-busy", "true");
  await root.getByText("5. Artist videos · Disabled", { exact: true }).click();
  await root
    .getByRole("button", { name: "Delete social link", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete social link?", exact: true })
    .getByRole("button", { name: "Delete link", exact: true })
    .click();
  await expect
    .poll(
      () => app.db.prepare("SELECT count(*) AS n FROM social_links").get().n,
    )
    .toBe(0);
});
test("paginated Blog and literal hostile text stay private; logout clears reading state and stale requests cannot repopulate it", async ({
  page,
  app,
}) => {
  const auth = await login(page, app);
  for (let i = 0; i < 13; i++)
    await article(
      page,
      app,
      auth,
      i === 0
        ? "<img src=x onerror=window.injected=true>"
        : "Synthetic article " + i,
    );
  await login(page, app, "listener");
  await page.goto(app.url);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Blog", exact: true }).click();
  await expect(page.locator(".article-card")).toHaveCount(12);
  await page
    .getByRole("button", { name: "Load more articles", exact: true })
    .click();
  await expect(page.locator(".article-card")).toHaveCount(13);
  await expect(
    page.getByRole("button", {
      name: "<img src=x onerror=window.injected=true>",
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  let release, received;
  const pending = new Promise((resolve) => (release = resolve)),
    arrival = new Promise((resolve) => (received = resolve));
  await page.route("**/api/blog", async (route) => {
    received();
    await pending;
    await route.fulfill({
      json: {
        articles: [
          {
            id: "private-delayed",
            title: "Delayed private content",
            excerpt: "Secret after logout",
            prominence: "normal",
            published_at: Date.now(),
          },
        ],
        nextOffset: null,
      },
    });
  });
  await page.getByRole("button", { name: "Blog", exact: true }).click();
  await arrival;
  await page.getByLabel("Account and privacy", { exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator("#auth")).toBeVisible();
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/blog",
  );
  release();
  await response;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator("#blog-content")).toBeEmpty();
  await page.unroute("**/api/blog");
  expect((await page.request.get(app.url + "/api/blog")).status()).toBe(401);
});

test("paid playback keeps the same funded engagement and audio element while browsing Blog, Social and Store", async ({
  page,
  app,
}) => {
  const auth = await login(page, app, "listener");
  app.db
    .prepare("UPDATE settings SET value='true' WHERE key='credits_enabled'")
    .run();
  app.db
    .prepare("UPDATE users SET credit_units=3000 WHERE id=?")
    .run(auth.user.id);
  app.db.prepare("UPDATE tracks SET price_units=1000").run();
  const wav = Buffer.alloc(44 + 8000 * 70 * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  await page.route("**/api/tracks/*/audio", (r) =>
    r.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
  );
  await page.goto(app.url);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("#play").click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 0),
    )
    .toBe(true);
  const engagement = app.db
    .prepare("SELECT * FROM play_engagements WHERE state='open'")
    .get();
  expect(engagement.held_units).toBe(1000);
  await page.locator("audio").evaluate((a) => (window.paidAudio = a));
  for (const section of ["Blog", "Social", "Store", "Player"])
    await page.getByRole("button", { name: section, exact: true }).click();
  expect(
    await page
      .locator("audio")
      .evaluate((a) => a === window.paidAudio && !a.paused),
  ).toBe(true);
  expect(
    app.db.prepare("SELECT * FROM play_engagements WHERE state='open'").get(),
  ).toEqual(engagement);
  expect(
    app.db
      .prepare("SELECT credit_units FROM users WHERE id=?")
      .get(auth.user.id).credit_units,
  ).toBe(3000);
  expect(
    app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
  ).toBe(0);
});

test("article deletion requires confirmation and preserves the saved article on cancel", async ({
  page,
  app,
}) => {
  const auth = await login(page, app),
    row = await article(page, app, auth, "Deletion example");
  await page.goto(app.url + "/admin");
  const root = page.locator("#articles");
  await root
    .getByRole("button", { name: "Deletion example · Published", exact: true })
    .click();
  await root
    .getByRole("button", { name: "Delete article", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Delete article?",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    app.db.prepare("SELECT id FROM articles WHERE id=?").get(row.id),
  ).toBeTruthy();
  await root
    .getByRole("button", { name: "Delete article", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete article permanently", exact: true })
    .click();
  await expect(root.getByRole("status")).toContainText("Article deleted");
  expect(
    app.db.prepare("SELECT id FROM articles WHERE id=?").get(row.id),
  ).toBeUndefined();
});
