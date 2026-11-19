/*
The contents of this file are subject to the Common Public Attribution License Version 1.0 (CPAL-1.0); you may not use it except in compliance with the License. Obtain the License at https://opensource.org/license/CPAL-1.0 or see LICENSE. CPAL is based on MPL 1.1, with Sections 14 and 15 added for attribution and network use.
Original Code: Musixene Artist Platform. Original Developer and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC). Portions written by Musixene: Copyright (c) 2026 Musixene. All Rights Reserved. Software is provided AS IS, WITHOUT WARRANTY OF ANY KIND.
*/
import { test, expect } from "@playwright/test";
test("administrator edits branding, uploads a draft, publishes a collection, and invites a listener", async ({
  page,
  browser,
}) => {
  const failures = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("browser-admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic admin passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Account and privacy").click();
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  await expect(page.locator("#administration")).toBeVisible();
  await page.getByLabel("Artist name", { exact: true }).fill("Browser Artist");
  await page.getByLabel("Allow public signup").uncheck();
  await page
    .locator("#settings-form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator("#admin-status")).toHaveText("Saved.");
  await page
    .getByLabel("Track title", { exact: true })
    .fill("Browser uploaded track");
  await page
    .locator("#track-form")
    .getByRole("button", { name: "Create draft" })
    .click();
  let card = page
    .locator("#track-list details")
    .filter({
      has: page.locator("summary", { hasText: "Browser uploaded track" }),
    });
  await card.locator("summary").click();
  const wav = Buffer.alloc(244);
  wav.write("RIFF");
  wav.writeUInt32LE(236, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24);
  wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(200, 40);
  await card
    .getByLabel("Choose audio")
    .setInputFiles({
      name: "synthetic.wav",
      mimeType: "audio/wav",
      buffer: wav,
    });
  await card.getByRole("button", { name: "Upload audio", exact: true }).click();
  await expect(page.locator("#admin-status")).toHaveText("Saved.");
  await expect(card.locator("summary")).toBeVisible();
  // Successful uploads redraw forms, keeping the server state authoritative.
  await card.locator("summary").click();
  await card.getByLabel("Available to listeners", { exact: true }).check();
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.locator("summary")).toContainText("Available");
  const collection = page.locator("#collection-new");
  await collection.getByLabel("Catalog title").fill("Browser collection");
  await collection
    .getByLabel("Catalog available to listeners", { exact: true })
    .check();
  await collection
    .getByLabel("Add track", { exact: true })
    .selectOption({ label: "Browser uploaded track" });
  await collection
    .getByRole("button", { name: "Add track", exact: true })
    .click();
  await collection
    .getByRole("button", { name: "Create catalog", exact: true })
    .click();
  await expect(
    page
      .locator("#collection-list summary")
      .filter({ hasText: "Browser collection" }),
  ).toContainText("Browser collection");
  await page.getByLabel("Restrict to username").fill("browser-invited");
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(page.locator("#invite-token")).toContainText("Invitation token");
  const token = (await page.locator("#invite-token").textContent()).match(
    /[a-f0-9]{64}/,
  )[0];
  const context = await browser.newContext();
  const listener = await context.newPage();
  await listener.goto("/");
  await listener.getByRole("button", { name: /Have an invitation/ }).click();
  await listener
    .getByLabel("Username", { exact: true })
    .fill("browser-invited");
  await listener
    .getByLabel("Password", { exact: true })
    .fill("synthetic invited passphrase");
  await listener.getByLabel("Invitation token").fill(token);
  await listener
    .getByRole("button", { name: "Create listener account", exact: true })
    .click();
  await expect(listener.locator(".track")).toHaveCount(4);
  await expect(
    listener.getByRole("link", { name: "Administration", exact: true }),
  ).toBeHidden();
  await listener
    .getByLabel("Catalog", { exact: true })
    .selectOption({ label: "Browser collection" });
  await expect(listener.locator(".track")).toHaveCount(1);
  await expect(listener.locator(".track")).toContainText(
    "Browser uploaded track",
  );
  await listener.goto("/admin");
  await expect(listener.locator("#admin-status")).toContainText(
    "Administrator access required",
  );
  await context.close();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/musixene-admin.png", fullPage: true });
  expect(failures).toEqual([]);
  // Restore public signup for the independent player smoke test.
  await page.getByLabel("Allow public signup").check();
  await page
    .locator("#settings-form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  // Hide the test upload again to keep the three-tone player fixture unchanged.
  await card.locator("summary").click();
  await card.getByLabel("Available to listeners", { exact: true }).uncheck();
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.locator("summary")).toContainText("Hidden");
});
