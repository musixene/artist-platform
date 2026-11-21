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
import { test as baseTest, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID, scryptSync } from "node:crypto";
import { createApplication } from "../../apps/server/app.js";
import { loadConfig } from "../../apps/server/config.js";
const test = baseTest.extend({
  app: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), "artist-diag-browser-"));
    execFileSync(process.execPath, ["scripts/generate-demo.js"], {
      env: { ...process.env, DATA_DIR: directory },
    });
    const config = loadConfig({
        DATA_DIR: directory,
        DIAGNOSTICS_ALLOWED: "true",
        APP_ORIGIN: "http://localhost:3000",
      }),
      app = createApplication(config);
    const password = "synthetic diagnostic passphrase",
      salt = "synthetic-salt",
      hash = scryptSync(password, salt, 64).toString("hex");
    for (const [username, role] of [
      ["admin-one", "administrator"],
      ["admin-two", "administrator"],
      ["listener", "listener"],
    ])
      app.db
        .prepare(
          "INSERT INTO users(id,username,salt,password_hash,created_at,role) VALUES(?,?,?,?,?,?)",
        )
        .run(randomUUID(), username, salt, hash, Date.now(), role);
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    config.origin = `http://127.0.0.1:${app.server.address().port}`;
    try {
      await use({ ...app, url: config.origin, password });
    } finally {
      await new Promise((r) => app.server.close(r));
      app.db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
});
async function login(page, app, username = "admin-one") {
  const response = await page.request.post(app.url + "/api/login", {
    headers: { Origin: app.url },
    data: { username, password: app.password },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function start(page, app) {
  await login(page, app);
  await page.goto(app.url + "/admin");
  await expect(
    page.getByRole("button", { name: "Start Debug", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Instance Diagnostics Enabled").check();
  await page.getByRole("button", { name: "Save Diagnostic Settings" }).click();
  await expect(
    page.getByRole("button", { name: "Start Debug", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start Debug", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop Debug", exact: true }),
  ).toBeEnabled();
}
async function diag(page, fn) {
  await page.evaluate(async () => {
    window.testDiagnostics = (await import("/diagnostics.js")).diagnostics;
  });
  return page.evaluate(fn);
}
async function saved(page, app) {
  const result = await page.request.get(
    app.url + "/api/admin/diagnostics/reports",
  );
  return (await result.json()).reports;
}
async function report(page, app) {
  const reports = await saved(page, app);
  expect(reports).toHaveLength(1);
  return (
    await page.request.get(
      app.url + "/api/admin/diagnostics/reports/" + reports[0].id,
    )
  ).json();
}

test("explicit opt-in persists across admin/player navigation and reload; captures transitions and actual play rejection without streaming", async ({
  page,
  app,
}) => {
  const posts = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/diagnostics/"))
      posts.push(r.url());
  });
  await start(page, app);
  await page.goto(app.url + "/");
  await expect(page.locator("#diagnostics-link")).toContainText("Recording");
  const id = await diag(page, (d) => window.testDiagnostics.state.id);
  await page.reload();
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state?.status))
    .toBe("recording");
  expect(await diag(page, (d) => window.testDiagnostics.state.id)).toBe(id);
  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(
        new DOMException("play() requires a user gesture", "NotAllowedError"),
      );
    document.querySelector("audio").dispatchEvent(new Event("ended"));
  });
  await expect
    .poll(() =>
      diag(page, (d) =>
        window.testDiagnostics.state.events.some(
          (e) => e.event === "play-request-rejected",
        ),
      ),
    )
    .toBe(true);
  expect(posts.filter((p) => p.endsWith("/reports"))).toHaveLength(0);
  await page.goto(app.url + "/admin#diagnostics");
  await page.getByRole("button", { name: "Stop Debug", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start Debug", exact: true }),
  ).toBeEnabled();
  expect(posts.filter((p) => p.endsWith("/reports"))).toHaveLength(1);
  const data = await report(page, app),
    names = data.events.map((e) => e.event);
  for (const name of [
    "ended-received",
    "next-track-selected",
    "source-change-initiated",
    "source-assigned",
    "source-change-completed",
    "play-requested",
    "play-request-rejected",
  ])
    expect(names).toContain(name);
  const last = names.lastIndexOf("ended-received");
  expect(names.indexOf("next-track-selected", last)).toBeGreaterThan(last);
  expect(names.indexOf("play-requested", last)).toBeGreaterThan(
    names.indexOf("source-assigned", last),
  );
  expect(
    data.events.find((e) => e.event === "play-request-rejected").error.name,
  ).toBe("NotAllowedError");
  expect(await diag(page, (d) => window.testDiagnostics.state)).toBeNull();
});
test("failed upload stays finalized across reload; local export and idempotent retry recover without a new recording", async ({
  page,
  app,
}) => {
  await start(page, app);
  let fail = true;
  await page.route("**/api/admin/diagnostics/reports", async (route) => {
    if (route.request().method() === "POST" && fail)
      await route.fulfill({
        status: 503,
        json: { error: "Synthetic upload failure" },
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Stop Debug", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry Upload", exact: true }),
  ).toBeEnabled();
  const frozen = await diag(page, (d) => window.testDiagnostics.state.report);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry Upload", exact: true }),
  ).toBeEnabled();
  expect(await diag(page, (d) => window.testDiagnostics.state.report)).toEqual(
    frozen,
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Local Report", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/^diagnostic-.*json$/);
  fail = false;
  await page.getByRole("button", { name: "Retry Upload", exact: true }).click();
  await expect.poll(async () => (await saved(page, app)).length).toBe(1);
  expect((await report(page, app)).recordingId).toBe(frozen.recordingId);
});
test("logout uploads and acknowledges before revoking the session; saved history survives login and listener does not inherit recording", async ({
  page,
  app,
}) => {
  await start(page, app);
  await page.goto(app.url + "/");
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state?.status))
    .toBe("recording");
  const order = [];
  page.on("request", (r) => {
    if (r.method() === "POST") order.push(new URL(r.url()).pathname);
  });
  await page.locator("#account-menu > summary").click();
  await page.locator("#logout").click();
  await expect(page.locator("#auth")).toBeVisible();
  expect(order.indexOf("/api/admin/diagnostics/reports")).toBeLessThan(
    order.indexOf("/api/logout"),
  );
  await login(page, app);
  const data = await report(page, app);
  expect(data.reason).toBe("logout");
  expect(data.events.some((e) => e.event === "logout-initiated")).toBe(true);
  await page.reload();
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state))
    .toBeNull();
  await page.request.post(app.url + "/api/logout", {
    headers: {
      Origin: app.url,
      "X-CSRF-Token": (
        await (await page.request.get(app.url + "/api/me")).json()
      ).csrf,
    },
    data: {},
  });
  await login(page, app, "listener");
  await page.reload();
  await expect(page.locator("#admin-link")).toBeHidden();
  expect(await diag(page, (d) => window.testDiagnostics.state)).toBeNull();
});
test("logout timeout offers explicit discard and clears local private state before next authentication", async ({
  page,
  app,
}) => {
  await start(page, app);
  await page.route("**/api/admin/diagnostics/reports", async (route) => {
    if (route.request().method() === "POST")
      await new Promise((resolve) => setTimeout(resolve, 10000))
        .then(() => route.abort())
        .catch(() => {});
    else await route.continue();
  });
  await page.locator("#admin-logout").click();
  await expect(
    page.getByRole("button", { name: "Discard and Continue Logout" }),
  ).toBeVisible({ timeout: 12000 });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Discard and Continue Logout" })
    .click();
  await expect(page.locator("#auth")).toBeVisible();
  await login(page, app, "admin-two");
  await page.goto(app.url + "/admin");
  await expect(
    page.getByRole("button", { name: "Start Debug", exact: true }),
  ).toBeEnabled();
  expect(await diag(page, (d) => window.testDiagnostics.state)).toBeNull();
  expect(await saved(page, app)).toHaveLength(0);
});
test("logout failure supports retry and export-then-continue; normal logout adds no diagnostic request", async ({
  page,
  app,
}) => {
  await login(page, app);
  await page.goto(app.url + "/");
  await expect(page.locator("#library")).toBeVisible();
  const normal = [];
  page.on("request", (r) => normal.push(r.url()));
  await page.locator("#account-menu > summary").click();
  await page.locator("#logout").click();
  await expect(page.locator("#auth")).toBeVisible();
  expect(normal.some((u) => u.includes("/diagnostics/"))).toBe(false);
  await start(page, app);
  let fail = true;
  await page.route("**/api/admin/diagnostics/reports", async (route) => {
    if (route.request().method() === "POST" && fail)
      await route.fulfill({
        status: 503,
        json: { error: "Synthetic failure" },
      });
    else await route.continue();
  });
  await page.locator("#admin-logout").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Retry Upload", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export and Continue Logout" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export and Continue Logout" })
    .click();
  await download;
  await expect(page.locator("#auth")).toBeVisible();
  await login(page, app);
  await page.goto(app.url + "/admin");
  await expect(
    page.getByRole("button", { name: "Start Debug", exact: true }),
  ).toBeEnabled();
  expect(await diag(page, (d) => window.testDiagnostics.state)).toBeNull();
  await page.getByRole("button", { name: "Start Debug", exact: true }).click();
  fail = false;
  await page.locator("#admin-logout").click();
  await expect(page.locator("#auth")).toBeVisible();
  expect(await login(page, app)).toBeTruthy();
  expect(await saved(page, app)).toHaveLength(1);
});
test("session changes, role revocation, and policy revocation cannot silently resume a recording", async ({
  page,
  app,
}) => {
  await start(page, app);
  const oldId = await diag(page, (d) => window.testDiagnostics.state.id);
  await login(page, app);
  await page.reload();
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state))
    .toBeNull();
  await page.getByRole("button", { name: "Start Debug", exact: true }).click();
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state?.status))
    .toBe("recording");
  expect(await diag(page, (d) => window.testDiagnostics.state.id)).not.toBe(
    oldId,
  );
  app.db
    .prepare(
      "UPDATE settings SET value='false' WHERE key='diagnostics_enabled'",
    )
    .run();
  app.db
    .prepare("UPDATE settings SET value='2' WHERE key='diagnostics_generation'")
    .run();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state?.status))
    .toBe("upload_failed");
  const count = await diag(
    page,
    (d) => window.testDiagnostics.state.events.length,
  );
  await diag(page, (d) =>
    window.testDiagnostics.event("playback", "synthetic-after-revocation"),
  );
  expect(
    await diag(page, (d) => window.testDiagnostics.state.events.length),
  ).toBe(count);
  app.db
    .prepare("UPDATE users SET role='listener' WHERE username='admin-one'")
    .run();
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state))
    .toBeNull();
});
test("offline recording remains local, reconnect validates permission, bounded events exclude private fields", async ({
  page,
  app,
}) => {
  await start(page, app);
  await page.goto(app.url + "/");
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state?.status))
    .toBe("recording");
  await page.context().setOffline(true);
  await diag(page, (d) => {
    for (let i = 0; i < 4100; i++)
      window.testDiagnostics.event("playback", "synthetic-sample", {
        positionSeconds: i,
        password: "synthetic-secret",
        body: "private note",
        cookie: "private cookie",
      });
  });
  const state = await diag(page, (d) => ({
    count: window.testDiagnostics.state.events.length,
    dropped: window.testDiagnostics.state.droppedEvents,
    events: window.testDiagnostics.state.events,
  }));
  expect(state.count).toBeLessThanOrEqual(4000);
  expect(state.dropped).toBeGreaterThan(0);
  expect(JSON.stringify(state.events)).not.toMatch(
    /synthetic-secret|private note|private cookie/,
  );
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.suspended))
    .toBe(false);
  await page.goto(app.url + "/admin");
  await page.getByRole("button", { name: "Stop Debug", exact: true }).click();
  await expect.poll(async () => (await saved(page, app)).length).toBe(1);
});
test("IndexedDB write failure freezes diagnostics without interrupting the persistent audio player", async ({
  page,
  app,
}) => {
  await start(page, app);
  await page.goto(app.url + "/");
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state?.status))
    .toBe("recording");
  await page.locator("#play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused))
    .toBe(true);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Synthetic quota failure", "QuotaExceededError");
    };
  });
  await diag(page, (d) =>
    window.testDiagnostics.event("playback", "synthetic-storage-failure"),
  );
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state?.reason))
    .toBe("storage_failure");
  expect(await page.locator("audio").evaluate((a) => !a.paused)).toBe(true);
  expect(
    await diag(page, (d) => window.testDiagnostics.report().events.length),
  ).toBeGreaterThan(0);
});

test("owned history can be viewed, exported and deleted; Diagnostics fits mobile and desktop", async ({
  page,
  app,
}, testInfo) => {
  await start(page, app);
  await page.getByRole("button", { name: "Stop Debug", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View Report", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View Report", exact: true }).click();
  await expect(page.getByLabel("Diagnostic report JSON")).toContainText(
    '"reportVersion": 1',
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  await download;
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator("#diagnostics").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`diagnostics-${width}.png`),
      fullPage: false,
    });
  }
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Report", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "View Report", exact: true }),
  ).toHaveCount(0);
  expect(await saved(page, app)).toHaveLength(0);
});
test("another tab cannot take over recording; a different administrator session invalidates the former local report", async ({
  page,
  app,
}) => {
  await start(page, app);
  const second = await page.context().newPage();
  await second.goto(app.url + "/admin");
  await second
    .getByRole("button", { name: "Start Debug", exact: true })
    .click();
  await expect(second.locator("#diagnostics")).toContainText(
    "existing local report",
  );
  expect(await diag(second, (d) => window.testDiagnostics.state)).toBeNull();
  await login(second, app, "admin-two");
  await second.reload();
  await expect
    .poll(() => diag(second, (d) => window.testDiagnostics.state))
    .toBeNull();
  await second
    .getByRole("button", { name: "Start Debug", exact: true })
    .click();
  await expect
    .poll(() => diag(second, (d) => window.testDiagnostics.state?.status))
    .toBe("recording");
  const newerId = await diag(second, (d) => window.testDiagnostics.state.id);
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect
    .poll(() => diag(page, (d) => window.testDiagnostics.state))
    .toBeNull();
  await second.reload();
  await expect
    .poll(() => diag(second, (d) => window.testDiagnostics.state?.id))
    .toBe(newerId);
  await second.close();
});

test("an unresponsive diagnostic context cannot prevent normal administrator playback", async ({
  page,
  app,
}) => {
  await login(page, app);
  await page.route("**/api/admin/diagnostics/context", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6500));
    await route.abort().catch(() => {});
  });
  await page.goto(app.url + "/");
  await expect(page.locator("#library")).toBeVisible({ timeout: 8000 });
  await page.locator("#play").click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused))
    .toBe(true);
  expect(await diag(page, (d) => window.testDiagnostics.state)).toBeNull();
});

test("clearing a session cancels a pending finalization before it can submit any report", async ({
  page,
  app,
}) => {
  await start(page, app);
  const uploads = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/diagnostics/reports"))
      uploads.push(r.url());
  });
  await diag(page, async () => {
    const d = window.testDiagnostics,
      flush = d.flush.bind(d);
    let calls = 0,
      resume,
      entered;
    const paused = new Promise((resolve) => (resume = resolve)),
      ready = new Promise((resolve) => (entered = resolve));
    d.flush = () => {
      calls++;
      if (calls >= 3) {
        entered();
        return paused;
      }
      return flush();
    };
    const stopping = d.stop();
    await ready;
    await d.clear();
    resume();
    await stopping;
    d.flush = flush;
  });
  expect(uploads).toHaveLength(0);
  expect(await saved(page, app)).toHaveLength(0);
  expect(await diag(page, () => window.testDiagnostics.state)).toBeNull();
});
