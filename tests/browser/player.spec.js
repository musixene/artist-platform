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
test("listener registers, plays/selects/seeks, changes queue modes, logs out and signs back in", async ({
  page,
}) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Come on in." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New here? Create a listener account" })
    .click();
  await page.getByLabel("Username", { exact: true }).fill("browser-listener");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a synthetic browser passphrase");
  await page
    .getByRole("button", { name: "Create listener account", exact: true })
    .click();
  await expect(page.locator(".track")).toHaveCount(3);
  await page.locator(".track").first().click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio) => !audio.paused && audio.currentTime > 0),
    )
    .toBe(true);
  await expect(page.locator("#now-title")).toHaveText("Morning signal");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((audio) => audio.paused))
    .toBe(true);
  await page.locator("#seek").evaluate((input) => {
    input.value = "8";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect
    .poll(() =>
      page.locator("audio").evaluate((audio) => Math.round(audio.currentTime)),
    )
    .toBe(8);
  await page.getByRole("button", { name: "Next track", exact: true }).click();
  await expect(page.locator("#now-title")).toHaveText("Small hours");
  await page.locator(".track").last().click();
  await expect(page.locator("#now-title")).toHaveText("Open horizon");
  await page.getByRole("button", { name: "Repeat off", exact: true }).click();
  await page.locator("audio").evaluate((audio) => {
    audio.currentTime = audio.duration - 0.15;
  });
  await expect(page.locator("#now-title")).toHaveText("Morning signal");
  await page.getByRole("button", { name: "Shuffle", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Shuffle", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next track", exact: true }).click();
  await expect(page.locator("#now-title")).not.toHaveText("Morning signal");
  await expect
    .poll(() => page.evaluate(() => navigator.mediaSession?.metadata?.title))
    .not.toBeNull();
  await page.reload();
  await expect(page.locator(".track")).toHaveCount(3);
  const privateCached = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      )
    )
      .flat()
      .filter(
        (path) => path.startsWith("/api/") || path.startsWith("/branding/"),
      ),
  );
  expect(privateCached).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(async () => !!(await navigator.serviceWorker.ready).active),
    )
    .toBe(true);
  await expect(
    page
      .getByRole("contentinfo")
      .getByRole("link", {
        name: "Powered by an Open Source Concept from Musixene",
        exact: true,
      }),
  ).toHaveAttribute("href", "https://musixene.com");
  await page.getByLabel("Account and privacy").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator("#auth")).toBeVisible();
  await expect(page.locator("#player")).toBeHidden();
  await page.getByLabel("Username", { exact: true }).fill("browser-listener");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a synthetic browser passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".track")).toHaveCount(3);
  expect(failures).toEqual([]);
});

test("mobile login, footer notices and administrator identity remain readable", async ({
  page,
}) => {
  for (const [width, height] of [
    [390, 844],
    [360, 740],
    [1280, 900],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    for (const route of ["/", "/admin"]) {
      await page.goto(route);
      const footer = page.getByRole("contentinfo");
      await expect(footer).toContainText("© 2026 Musixene");
      await expect(
        footer.getByRole("link", {
          name: "Powered by an Open Source Concept from Musixene",
          exact: true,
        }),
      ).toHaveAttribute("href", "https://musixene.com");
      await expect(
        footer.getByRole("link", { name: "Source (CPAL 1.0)", exact: true }),
      ).toHaveAttribute("href", "https://github.com/musixene/artist-platform");
      const bounds = await footer.boundingBox();
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
