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
export const test = baseTest.extend({
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
      app.server.closeAllConnections();
      await new Promise((r) => app.server.close(r));
      app.db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
});
export async function login(page, app, username = "admin-one") {
  const response = await page.request.post(app.url + "/api/login", {
    headers: { Origin: app.url },
    data: { username, password: app.password },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
export async function start(page, app) {
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
export async function diag(page, fn) {
  await page.evaluate(async () => {
    window.testDiagnostics = (await import("/diagnostics.js")).diagnostics;
  });
  return page.evaluate(fn);
}
export async function saved(page, app) {
  const result = await page.request.get(
    app.url + "/api/admin/diagnostics/reports",
  );
  return (await result.json()).reports;
}
export async function report(page, app) {
  const reports = await saved(page, app);
  expect(reports).toHaveLength(1);
  return (
    await page.request.get(
      app.url + "/api/admin/diagnostics/reports/" + reports[0].id,
    )
  ).json();
}
