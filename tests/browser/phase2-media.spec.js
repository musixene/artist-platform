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
import { test, start, diag, report, login } from "./diagnostics-fixture.js";
async function player(page, app) {
  await start(page, app);
  await page.goto(app.url + "/");
  await expect(page.locator("#library")).toBeVisible();
}
async function fail(page) {
  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(
        new DOMException(
          "Synthetic media initialization failure",
          "NotSupportedError",
        ),
      );
    document.querySelector("audio").pause();
    document.querySelector("#play").click();
  });
  await expect
    .poll(() =>
      diag(page, () => window.testDiagnostics.state?.failedMedia?.trackId),
    )
    .toBeTruthy();
}
for (const status of [200, 206, 401, 403, 404, 416, 500])
  test(`manual foreground probe records HTTP ${status} without consuming audio or changing playback`, async ({
    page,
    app,
  }) => {
    await player(page, app);
    await fail(page);
    const before = await page
      .locator("audio")
      .evaluate((a) => ({ src: a.src, time: a.currentTime, paused: a.paused }));
    let probes = 0;
    await page.route("**/api/tracks/*/audio", async (route) => {
      if (route.request().headers().range === "bytes=0-0") {
        probes++;
        await route.fulfill({
          status,
          headers: {
            "Content-Type":
              status === 200 || status === 206
                ? "audio/wav"
                : "application/json",
            "Content-Length": status === 206 ? "1" : "64",
            ...(status === 206
              ? { "Content-Range": "bytes 0-0/12345" }
              : status === 416
                ? { "Content-Range": "bytes */12345" }
                : {}),
            "Accept-Ranges": "bytes",
          },
          body:
            status === 206
              ? "R"
              : "SYNTHETIC AUDIO BODY MUST NOT ENTER A REPORT".padEnd(64, " "),
        });
      } else await route.continue();
    });
    expect(probes).toBe(0);
    await page.locator("#account-menu > summary").click();
    await page
      .getByRole("button", { name: "Test Failed Media Source", exact: true })
      .click();
    await expect
      .poll(() =>
        diag(page, () =>
          window.testDiagnostics.state.events.some(
            (e) => e.event === "foreground-media-probe",
          ),
        ),
      )
      .toBe(true);
    const event = await diag(page, () =>
      window.testDiagnostics.state.events.findLast(
        (e) => e.event === "foreground-media-probe",
      ),
    );
    expect(event.probe.status).toBe(status);
    expect(event.probe.kind).toBe("subsequent_foreground_probe");
    expect(event.probe.bodyRead).toBe(false);
    expect(event.probe.rangeHonored).toBe(status === 206);
    expect(probes).toBe(1);
    expect(
      await page.locator("audio").evaluate((a) => ({
        src: a.src,
        time: a.currentTime,
        paused: a.paused,
      })),
    ).toEqual(before);
    expect(JSON.stringify(event)).not.toContain("SYNTHETIC AUDIO BODY");
  });
test("native unsupported media failure captures snapshots and passive timing; zero/missing timing is inconclusive", async ({
  page,
  app,
}) => {
  await player(page, app);
  let requests = 0;
  await page.route("**/api/tracks/*/audio", async (route) => {
    requests++;
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: "SYNTHETIC INVALID WAV",
    });
  });
  await page.locator(".track").nth(1).click();
  await expect
    .poll(() =>
      diag(page, () =>
        window.testDiagnostics.state.events.some(
          (e) => e.event === "audio-error",
        ),
      ),
    )
    .toBe(true);
  const snapshot = await diag(
    page,
    () =>
      window.testDiagnostics.state.events.findLast(
        (e) => e.event === "audio-error",
      ).media,
  );
  expect(snapshot.mediaErrorCode).toBe(4);
  expect(snapshot.mime).toBe("audio/wav");
  expect(["", "maybe", "probably"]).toContain(snapshot.canPlayType);
  expect(snapshot.expectedPath).toMatch(/^\/api\/tracks\/[a-f0-9-]+\/audio$/);
  expect(snapshot.buffered).toBeInstanceOf(Array);
  expect(snapshot.online).toBe(true);
  await expect
    .poll(() =>
      diag(page, () =>
        window.testDiagnostics.state.events.some(
          (e) => e.event === "audio-resource-timing",
        ),
      ),
    )
    .toBe(true);
  const timing = await diag(
    page,
    () =>
      window.testDiagnostics.state.events.findLast(
        (e) => e.event === "audio-resource-timing",
      ).resource,
  );
  expect(timing.trackId).toBe(snapshot.failedTrackId);
  expect(timing.path).not.toMatch(/https?:|\?/);
  expect(["available", "unavailable", "zero"]).toContain(
    timing.statusAvailability,
  );
  expect(timing.purpose).toBe("original_media");
  expect(requests).toBe(1);
});
test("successful foreground transition has timing and source snapshots; simulated overlap retains original play context", async ({
  page,
  app,
}) => {
  await player(page, app);
  await page.locator(".track").nth(1).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused))
    .toBe(true);
  await expect
    .poll(() =>
      diag(page, () =>
        window.testDiagnostics.state.events.some(
          (e) => e.event === "audio-canplay" && e.media,
        ),
      ),
    )
    .toBe(true);
  const values = await diag(page, () => {
    const d = window.testDiagnostics,
      ids = [...document.querySelectorAll(".track")]
        .map((n) => n.dataset.id)
        .filter(Boolean);
    const a = "00000000-0000-4000-8000-000000000001",
      b = "00000000-0000-4000-8000-000000000002";
    d.media.sourceChange(a);
    const operation = d.media.playRequested(a, "audio/mpeg");
    d.media.sourceChange(b);
    d.media.playRequested(b, "audio/wav");
    return d.media.failure(
      document.querySelector("audio"),
      { id: b, mime: "audio/wav" },
      operation,
      new DOMException("Synthetic overlap", "AbortError"),
    );
  });
  expect(values.failedTrackId).toBe("00000000-0000-4000-8000-000000000001");
  expect(values.sourceChangedSinceRequest).toBe(true);
  expect(values.playChangedSinceRequest).toBe(true);
  expect(values.operationMime).toBe("audio/mpeg");
  expect(values.playError.name).toBe("AbortError");
});
test("hidden page, disabled permission, and listeners cannot probe; probing never runs automatically", async ({
  page,
  app,
}) => {
  await player(page, app);
  await fail(page);
  let probes = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/audio") &&
      request.headers().range === "bytes=0-0"
    )
      probes++;
  });
  const result = await diag(page, async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    try {
      await window.testDiagnostics.media.probe();
      return "unexpected";
    } catch (error) {
      return error.message;
    } finally {
      delete document.visibilityState;
    }
  });
  expect(result).toContain("foreground");
  expect(probes).toBe(0);
  app.db
    .prepare(
      "UPDATE settings SET value='false' WHERE key='diagnostics_enabled'",
    )
    .run();
  await expect(async () =>
    diag(page, async () => {
      await window.testDiagnostics.media.probe();
    }),
  ).rejects.toThrow();
  expect(probes).toBe(0);
  await login(page, app, "listener");
  await page.reload();
  await expect(page.locator("#library")).toBeVisible();
  await expect(
    diag(page, async () => {
      await window.testDiagnostics.media.probe();
    }),
  ).rejects.toThrow();
  expect(await diag(page, () => window.testDiagnostics.state)).toBeNull();
  expect(probes).toBe(0);
});

for (const status of [200, 206, 401, 403, 404, 416, 500])
  test(`original native audio response ${status} is passively recorded when exposed`, async ({
    page,
    app,
  }) => {
    await player(page, app);
    const trackId = await page
        .locator(".track")
        .nth(1)
        .getAttribute("data-track-id"),
      path = `/api/tracks/${trackId}/audio`;
    const bytes = await (await page.request.get(app.url + path)).body();
    let requests = 0;
    await page.route(app.url + path, async (route) => {
      requests++;
      const successful = status === 200 || status === 206,
        body = successful ? bytes : Buffer.from("Synthetic HTTP error");
      await route.fulfill({
        status,
        headers: {
          "Content-Type": successful ? "audio/wav" : "application/json",
          "Content-Length": String(body.length),
          ...(status === 206
            ? { "Content-Range": `bytes 0-${body.length - 1}/${body.length}` }
            : status === 416
              ? { "Content-Range": `bytes */${bytes.length}` }
              : {}),
          "Accept-Ranges": "bytes",
        },
        body,
      });
    });
    await page.locator(".track").nth(1).click();
    if (status === 200 || status === 206)
      await expect
        .poll(() =>
          page.locator("audio").evaluate((a) => !a.paused && a.readyState >= 2),
        )
        .toBe(true);
    else
      await expect
        .poll(() =>
          diag(page, () =>
            window.testDiagnostics.state.events.some(
              (e) => e.event === "audio-error",
            ),
          ),
        )
        .toBe(true);
    await expect
      .poll(() =>
        diag(page, () =>
          window.testDiagnostics.state.events.some(
            (e) =>
              e.resource?.path ===
              document.querySelector("audio").getAttribute("src"),
          ),
        ),
      )
      .toBe(true);
    const entries = await diag(page, () =>
      window.testDiagnostics.state.events
        .filter(
          (e) =>
            e.resource?.path ===
            document.querySelector("audio").getAttribute("src"),
        )
        .map((e) => e.resource),
    );
    for (const entry of entries) {
      expect(entry.purpose).toBe("original_media");
      if (entry.statusAvailability === "available")
        expect(entry.responseStatus).toBe(status);
      else expect(entry.evidence).toBe("inconclusive");
    }
    expect(requests).toBeGreaterThan(0);
    expect(
      await diag(page, () =>
        window.testDiagnostics.state.events.some((e) => e.probe),
      ),
    ).toBe(false);
  });
test("missing Resource Timing APIs do not disrupt playback or imply a network failure", async ({
  page,
  app,
}) => {
  await page.addInitScript(() => {
    window.PerformanceObserver = undefined;
    performance.getEntriesByType = undefined;
  });
  await player(page, app);
  await page.locator(".track").nth(1).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => !a.paused))
    .toBe(true);
  await fail(page);
  const media = await diag(
    page,
    () =>
      window.testDiagnostics.state.events.findLast(
        (e) => e.event === "play-request-rejected",
      ).media,
  );
  expect(media.resourceTimingSupport).toBe("unavailable");
  expect(media.resources).toEqual([]);
  expect(
    await diag(
      page,
      () => window.testDiagnostics.report().mediaAnalysis.at(-1).cases,
    ),
  ).toEqual(["E"]);
});

test("a failed permission refresh cannot authorize an extra foreground media request", async ({
  page,
  app,
}) => {
  await player(page, app);
  await fail(page);
  let mediaRequests = 0;
  await page.route("**/api/admin/diagnostics/context", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Synthetic control endpoint failure" },
    }),
  );
  page.on("request", (request) => {
    if (
      request.url().endsWith("/audio") &&
      request.headers().range === "bytes=0-0"
    )
      mediaRequests++;
  });
  await expect(
    diag(page, async () => {
      await window.testDiagnostics.media.probe();
    }),
  ).rejects.toThrow();
  expect(mediaRequests).toBe(0);
});

test("bounded raw-event storage reserves room for worst-case format-2 summaries", async ({
  page,
  app,
}) => {
  await start(page, app);
  const result = await diag(page, () => {
    const d = window.testDiagnostics,
      trackId = "00000000-0000-4000-8000-000000000002";
    for (let i = 0; i < 5000; i++)
      d.event("network", "audio-resource-timing", {
        resource: {
          id: crypto.randomUUID(),
          documentId: d.documentId,
          trackId,
          path: `/api/tracks/${trackId}/audio`,
          initiatorType: "audio",
          purpose: "original_media",
          sourceGeneration: 1,
          startTime: i,
          responseEnd: i + 1,
          responseStatus: 100 + (i % 500),
          transferSize: 301,
          encodedBodySize: 1,
          decodedBodySize: 1,
          protocol: "h2",
          timeOrigin: performance.timeOrigin,
        },
      });
    for (let i = 0; i < 32; i++)
      d.event("playback", "audio-error", {
        trackId,
        media: {
          failedTrackId: trackId,
          sourceGeneration: 1,
          sourceStartTime: 0,
          snapshotAt: 10000,
          resources: [],
        },
      });
    const report = d.report();
    return {
      bytes: new TextEncoder().encode(JSON.stringify(report)).length,
      dropped: d.state.droppedEvents,
      summaries: report.mediaAnalysis.length,
      maximumCandidates: Math.max(
        ...report.mediaAnalysis.map((a) => a.candidateResourceIds.length),
      ),
    };
  });
  expect(result.dropped).toBeGreaterThan(0);
  expect(result.summaries).toBe(32);
  expect(result.maximumCandidates).toBeLessThanOrEqual(32);
  expect(result.bytes).toBeLessThanOrEqual(1048576);
});
