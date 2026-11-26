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
import { randomUUID } from "node:crypto";
async function simulate(page, app, { unlimited = false, balance = 5000 } = {}) {
  const auth = await login(page, app, "listener");
  app.db
    .prepare("UPDATE settings SET value='true' WHERE key='credits_enabled'")
    .run();
  app.db
    .prepare("UPDATE users SET credit_units=?,credits_unlimited=? WHERE id=?")
    .run(balance, Number(unlimited), auth.user.id);
  const track = app.db
    .prepare("SELECT * FROM tracks ORDER BY id LIMIT 1")
    .get();
  app.db.prepare("UPDATE tracks SET price_units=1250 WHERE id=?").run(track.id);
  await page.goto(app.url);
  await page.evaluate(
    async ({ auth, track }) => {
      const { mountListening } = await import("/listening.js");
      window.syntheticNow = 0;
      window.syntheticAudio = Object.assign(new EventTarget(), {
        duration: 120,
        currentTime: 0,
        paused: true,
        ended: false,
        readyState: 4,
        seeking: false,
      });
      window.syntheticAccount = {
        enabled: true,
        unlimited: false,
        balanceUnits: 5000,
        availableUnits: 5000,
        heldUnits: 0,
      };
      window.syntheticMessages = [];
      const api = async (path, options = {}) => {
        const r = await fetch(path, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": auth.csrf,
          },
        });
        const body = await r.json();
        if (!r.ok)
          throw Object.assign(new Error(body.error), { status: r.status });
        return body;
      };
      window.syntheticController = mountListening({
        audio: syntheticAudio,
        api,
        clock: () => syntheticNow,
        onAccount: (a) => {
          window.syntheticAccount = a;
        },
        onMessage: (m) => syntheticMessages.push(m),
      });
      syntheticController.session(auth.user.id, window.syntheticAccount);
      syntheticController.select({ ...track, price_units: 1250 });
    },
    { auth, track },
  );
  return { auth, track };
}
async function begin(page) {
  return page.evaluate(async () => {
    const pending = syntheticController.prepare();
    const allowed = pending ? await pending : true;
    if (allowed) {
      syntheticAudio.paused = false;
      syntheticAudio.dispatchEvent(new Event("playing"));
    }
    return allowed;
  });
}
async function progress(page, seconds) {
  await page.evaluate((seconds) => {
    for (let i = 0; i < seconds; i++) {
      syntheticNow += 1000;
      syntheticAudio.currentTime++;
      syntheticAudio.dispatchEvent(new Event("timeupdate"));
    }
  }, seconds);
}
function age(app) {
  app.db
    .prepare("UPDATE play_engagements SET started_at=? WHERE state='open'")
    .run(Date.now() - 61000);
}

test("synthetic observed playback qualifies once; pauses, buffering and seeks add nothing, retry survives reload without duplicate debit", async ({
  page,
  app,
}) => {
  await simulate(page, app);
  expect(await begin(page)).toBe(true);
  age(app);
  await progress(page, 30);
  await page.evaluate(() => {
    syntheticAudio.paused = true;
    syntheticAudio.dispatchEvent(new Event("pause"));
    syntheticNow += 30000;
    syntheticAudio.paused = false;
    syntheticAudio.dispatchEvent(new Event("playing"));
    syntheticAudio.seeking = true;
    syntheticAudio.currentTime += 40;
    syntheticAudio.dispatchEvent(new Event("seeking"));
    syntheticAudio.seeking = false;
    syntheticAudio.dispatchEvent(new Event("seeked"));
  });
  await progress(page, 29);
  expect(
    app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
  ).toBe(0);
  await page.route("**/api/listening/qualify", (r) => r.abort());
  await progress(page, 1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("musixene:qualifying-plays:v1") || "[]",
          ).length,
      ),
    )
    .toBe(1);
  expect(
    app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
  ).toBe(0);
  await page.unroute("**/api/listening/qualify");
  await page.reload();
  await expect
    .poll(
      () =>
        app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
    )
    .toBe(1);
  expect(
    app.db
      .prepare("SELECT credit_units FROM users WHERE username='listener'")
      .get().credit_units,
  ).toBe(3750);
  await page.reload();
  expect(
    app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
  ).toBe(1);
});
test("synthetic unlimited engagement counts without debit; finite empty wallet is refused; short audio stays free", async ({
  page,
  app,
}) => {
  await simulate(page, app, { unlimited: true, balance: 0 });
  expect(await begin(page)).toBe(true);
  age(app);
  await progress(page, 60);
  await expect
    .poll(
      () =>
        app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
    )
    .toBe(1);
  expect(
    app.db
      .prepare("SELECT credit_units FROM users WHERE username='listener'")
      .get().credit_units,
  ).toBe(0);
  await page.evaluate(() => {
    syntheticController.select({ id: "short-synthetic", price_units: 1250 });
    syntheticAudio.duration = 30;
    syntheticAudio.currentTime = 0;
  });
  expect(await begin(page)).toBe(true);
  await progress(page, 60);
  expect(
    app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
  ).toBe(1);
});
test("finite empty wallet blocks normal player authorization and never records or charges a play", async ({
  page,
  app,
}) => {
  await simulate(page, app, { balance: 0 });
  expect(await begin(page)).toBe(false);
  expect(await page.evaluate(() => syntheticAudio.paused)).toBe(true);
  expect(await page.evaluate(() => syntheticMessages.join(" "))).toContain(
    "Not enough credits",
  );
  expect(
    app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
  ).toBe(0);
});
test("artist can set prices, grant credits and unlimited eligibility, enable charging and view private qualifying-play totals", async ({
  page,
  app,
}) => {
  await login(page, app);
  await page.goto(app.url + "/admin");
  await page
    .getByRole("checkbox", { name: "Enable credit charging", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save charging policy", exact: true })
    .click();
  await expect
    .poll(
      () =>
        app.db
          .prepare("SELECT value FROM settings WHERE key='credits_enabled'")
          .get().value,
    )
    .toBe("true");
  const user = page.locator("#listener-list details").filter({
    has: page.locator("summary", { hasText: "listener · listener" }),
  });
  await user.locator("summary").click();
  await user
    .getByLabel("Unlimited credits (artist-approved)", { exact: true })
    .check();
  await user
    .getByLabel("Credit adjustment (0 to change unlimited only)", {
      exact: true,
    })
    .fill("2.5");
  await user
    .getByLabel("Reason for credit or eligibility change", { exact: true })
    .fill("Synthetic artist eligibility");
  await user
    .getByRole("button", { name: "Save listener credits", exact: true })
    .click();
  await expect
    .poll(
      () =>
        app.db
          .prepare(
            "SELECT credits_unlimited FROM users WHERE username='listener'",
          )
          .get().credits_unlimited,
    )
    .toBe(1);
  expect(
    app.db
      .prepare("SELECT credit_units FROM users WHERE username='listener'")
      .get().credit_units,
  ).toBe(2500);
  const track = page.locator("#track-list details").first();
  await track.locator("summary").click();
  await track
    .getByLabel("Credits per qualifying play (0 = free)", { exact: true })
    .fill("0.125");
  await track.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(
      () =>
        app.db
          .prepare("SELECT count(*) AS n FROM tracks WHERE price_units=125")
          .get().n,
    )
    .toBe(1);
  await expect(
    page.getByRole("table", {
      name: "Qualifying plays by track — last 90 days",
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#listening").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/qualifying-admin-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("native player reserves before paid playback, preserves an engagement over pause/resume, and releases it on next selection", async ({
  page,
  app,
}) => {
  const auth = await login(page, app, "listener");
  app.db
    .prepare("UPDATE settings SET value='true' WHERE key='credits_enabled'")
    .run();
  app.db
    .prepare("UPDATE users SET credit_units=2500 WHERE id=?")
    .run(auth.user.id);
  app.db.prepare("UPDATE tracks SET price_units=1250").run();
  // A synthetic 70-second silent WAV; no production content or physical-device claim.
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
  await page
    .getByRole("button", { name: "Don’t show again", exact: true })
    .click();
  await page.locator("#play").click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 0),
    )
    .toBe(true);
  expect(
    app.db
      .prepare("SELECT count(*) AS n FROM play_engagements WHERE state='open'")
      .get().n,
  ).toBe(1);
  const first = app.db
    .prepare("SELECT id FROM play_engagements WHERE state='open'")
    .get().id;
  await page.locator("#play").click();
  await page.locator("#play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused))
    .toBe(true);
  expect(
    app.db.prepare("SELECT count(*) AS n FROM play_engagements").get().n,
  ).toBe(1);
  await page.locator("#next").click();
  await expect
    .poll(
      () =>
        app.db
          .prepare(
            "SELECT count(*) AS n FROM play_engagements WHERE state='open'",
          )
          .get().n,
    )
    .toBe(1);
  await expect
    .poll(
      () =>
        app.db
          .prepare("SELECT state FROM play_engagements WHERE id=?")
          .get(first).state,
    )
    .toBe("closed");
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a) => !a.paused && a.currentTime > 0),
    )
    .toBe(true);
  expect(
    app.db.prepare("SELECT count(*) AS n FROM qualifying_plays").get().n,
  ).toBe(0);
  expect(
    app.db
      .prepare("SELECT credit_units FROM users WHERE id=?")
      .get(auth.user.id).credit_units,
  ).toBe(2500);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/qualifying-player-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
