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
import { test, login, start, diag } from "./diagnostics-fixture.js";

test("startup stays paused; selection and repeat request play before presentation without awaiting or retrying", async ({
  page,
  app,
}) => {
  await page.addInitScript(() => {
    window.playCalls = [];
    window.pendingPlay = [];
    HTMLMediaElement.prototype.play = function () {
      window.playCalls.push({
        src: this.getAttribute("src"),
        position: this.currentTime,
        title: document.querySelector("#now-title")?.textContent,
        feedback: document.querySelector("#active-feedback")?.textContent,
        metadata: navigator.mediaSession?.metadata?.title,
      });
      return new Promise((resolve, reject) =>
        window.pendingPlay.push({ resolve, reject }),
      );
    };
  });
  await login(page, app, "listener");
  await page.goto(app.url + "/");
  await expect(page.locator(".track")).toHaveCount(3);
  expect(await page.evaluate(() => window.playCalls)).toHaveLength(0);
  const titles = await page
      .locator(".track-row-title strong")
      .allTextContents(),
    id = await page.locator(".track").nth(1).getAttribute("data-track-id");
  await page.locator(".track").nth(1).click();
  await expect(page.locator("#now-title")).toHaveText(titles[1]);
  const calls = await page.evaluate(() => window.playCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].src).toBe(`/api/tracks/${id}/audio`);
  expect(calls[0].title).toBe(titles[0]);
  if (calls[0].metadata !== undefined)
    expect(calls[0].metadata).toBe(titles[0]);
  await expect(page.locator("#active-feedback")).toContainText(titles[1]);
  expect(
    await page.evaluate(() => navigator.mediaSession?.metadata?.title),
  ).toBe(titles[1]);
  // UI is already updated although the first promise remains deliberately pending.
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => Number.isFinite(a.duration)),
    )
    .toBe(true);
  await page.locator("#repeat").click();
  await page.locator("#repeat").click();
  await page.locator("audio").evaluate((a) => {
    a.currentTime = 5;
  });
  await page.locator("audio").evaluate((a) => {
    a.dispatchEvent(new Event("ended"));
  });
  await expect.poll(() => page.evaluate(() => window.playCalls.length)).toBe(2);
  const repeated = await page.evaluate(() => window.playCalls[1]);
  expect(repeated.src).toBe(calls[0].src);
  expect(repeated.position).toBe(0);
  await page.evaluate(() => {
    for (const p of window.pendingPlay)
      p.reject(
        new DOMException(
          "Synthetic pending playback rejection",
          "NotAllowedError",
        ),
      );
  });
  await expect(page.locator("#message")).toContainText(
    "Playback could not start",
  );
  expect(await page.evaluate(() => window.playCalls.length)).toBe(2);
  await expect(page.locator("#now-title")).toHaveText(titles[1]);
});

test("native automatic advancement uses one audio element and records play before position and metadata updates", async ({
  page,
  app,
}) => {
  await start(page, app);
  await page.goto(app.url + "/");
  await expect(page.locator(".track")).toHaveCount(3);
  await page.locator(".track").first().click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.readyState >= 2),
    )
    .toBe(true);
  await page.evaluate(() => {
    window.transitionOrder = [];
    window.originalAudio = document.querySelector("audio");
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.transitionOrder.push("play");
      return nativePlay.call(this);
    };
    if (navigator.mediaSession?.setPositionState) {
      const set = navigator.mediaSession.setPositionState.bind(
        navigator.mediaSession,
      );
      navigator.mediaSession.setPositionState = (value) => {
        window.transitionOrder.push("position");
        return set(value);
      };
    }
  });
  const marker = await diag(
      page,
      () => window.testDiagnostics.state.events.length,
    ),
    nextId = await page.locator(".track").nth(1).getAttribute("data-track-id");
  await page.locator("audio").evaluate((a) => {
    window.transitionOrder = [];
    a.dispatchEvent(new Event("ended"));
    window.synchronousOrder = [...window.transitionOrder];
  });
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.readyState >= 2),
    )
    .toBe(true);
  expect(
    await page.locator("audio").evaluate((a) => a === window.originalAudio),
  ).toBe(true);
  expect(await page.locator("audio").getAttribute("src")).toBe(
    `/api/tracks/${nextId}/audio`,
  );
  const names = await page.evaluate(async (marker) => {
    const { diagnostics } = await import("/diagnostics.js");
    return diagnostics.state.events.slice(marker).map((e) => e.event);
  }, marker);
  const assigned = names.indexOf("source-assigned"),
    played = names.indexOf("play-requested"),
    metadata = names.indexOf("metadata-update-started"),
    completed = names.indexOf("activation-completed");
  expect(assigned).toBeGreaterThanOrEqual(0);
  expect(played).toBeGreaterThan(assigned);
  expect(metadata).toBeGreaterThan(played);
  expect(completed).toBeGreaterThan(metadata);
  const order = await page.evaluate(() => window.synchronousOrder);
  expect(order[0]).toBe("play");
  expect(order.filter((x) => x === "play")).toHaveLength(1);
});

test("presentation failure after source assignment cannot prevent the initial play request", async ({
  page,
  app,
}) => {
  await start(page, app);
  await page.goto(app.url + "/");
  await expect(page.locator(".track")).toHaveCount(3);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const nextId = await page
    .locator(".track")
    .nth(1)
    .getAttribute("data-track-id");
  await page.evaluate(() => {
    window.presentationOrder = [];
    HTMLMediaElement.prototype.play = function () {
      window.presentationOrder.push({
        event: "play",
        src: this.getAttribute("src"),
      });
      return Promise.resolve();
    };
    const title = document.querySelector("#now-title");
    Object.defineProperty(title, "textContent", {
      configurable: true,
      set() {
        window.presentationOrder.push({ event: "title" });
        throw new Error("Synthetic presentation failure");
      },
    });
  });
  await page.locator(".track").nth(1).click();
  const order = await page.evaluate(() => window.presentationOrder);
  expect(order).toEqual([
    { event: "play", src: `/api/tracks/${nextId}/audio` },
    { event: "title" },
  ]);
  await expect
    .poll(() =>
      diag(page, () =>
        window.testDiagnostics.state.events.some(
          (e) => e.event === "activation-failed",
        ),
      ),
    )
    .toBe(true);
  expect(errors).toContain("Synthetic presentation failure");
  expect(order.filter((x) => x.event === "play")).toHaveLength(1);
});
