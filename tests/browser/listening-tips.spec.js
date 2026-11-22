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

test("launch preference can be dismissed, reopened and restored without interrupting audio", async ({
  page,
  app,
}) => {
  await login(page, app, "listener");
  await page.goto(app.url);
  const pane = page.locator("#listening-tips");
  await expect(pane).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(pane).toBeVisible();
  await page
    .getByRole("button", { name: "Don’t show again", exact: true })
    .click();
  await page.reload();
  await expect(pane).toBeHidden();
  await page.locator("#play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(0.1);
  const before = await page.locator("audio").evaluate((a) => {
    window.originalAudio = a;
    return { src: a.currentSrc, time: a.currentTime };
  });
  await page.getByLabel("Account and privacy").click();
  await page
    .getByRole("button", { name: "Listening tips", exact: true })
    .click();
  await expect(page.locator("#listening-tips-title")).toBeFocused();
  await expect(page.getByLabel("Show these tips at launch")).not.toBeChecked();
  await page.getByLabel("Show these tips at launch").check();
  await page.keyboard.press("Escape");
  await expect(pane).toBeHidden();
  const after = await page.locator("audio").evaluate((a) => ({
    same: a === window.originalAudio,
    src: a.currentSrc,
    time: a.currentTime,
    paused: a.paused,
  }));
  expect(after.same).toBe(true);
  expect(after.src).toBe(before.src);
  expect(after.time).toBeGreaterThanOrEqual(before.time);
  expect(after.paused).toBe(false);
  await page.reload();
  await expect(pane).toBeVisible();
});

test("tips work before sign-in and handle unavailable storage honestly", async ({
  page,
  app,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
  });
  await page.goto(app.url);
  await expect(page.locator("#auth-form")).toBeVisible();
  await page
    .getByRole("button", { name: "Don’t show again", exact: true })
    .click();
  await expect(page.locator("#listening-tips-status")).toContainText(
    "Couldn’t save",
  );
  await expect(page.getByLabel("Show these tips at launch")).toBeChecked();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#listening-tips")).toBeHidden();
  await page.reload();
  await expect(page.locator("#listening-tips")).toBeVisible();
});

test("mobile and desktop tips remain scrollable with attribution and touch controls", async ({
  page,
  app,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(app.url);
    await expect(page.locator("#listening-tips")).toBeVisible();
    const box = await page
      .getByRole("button", { name: "Close", exact: true })
      .boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".app-footer")).toBeInViewport();
    await page.screenshot({
      path: `/tmp/listening-tips-${viewport.width}.png`,
    });
  }
});
