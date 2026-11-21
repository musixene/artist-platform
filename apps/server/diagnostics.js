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
import { randomUUID, createHash } from "node:crypto";
import { LIMITS, UUID, validateReport } from "../web/diagnostic-format.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
const get = (db, key) =>
  JSON.parse(
    db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get("diagnostics_" + key).value,
  );
const set = (db, key, value) =>
  db
    .prepare("INSERT OR REPLACE INTO settings VALUES(?,?)")
    .run("diagnostics_" + key, JSON.stringify(value));
export function pruneDiagnostics(db, now = Date.now()) {
  db.prepare("DELETE FROM diagnostic_reports WHERE uploaded_at<?").run(
    now - get(db, "retention_days") * 86400000,
  );
  db.prepare("DELETE FROM diagnostic_recordings WHERE registered_at<?").run(
    now - LIMITS.durationMs,
  );
}
export function diagnosticService(db, config, version) {
  if (
    !db
      .prepare("SELECT 1 FROM settings WHERE key='diagnostics_installation_id'")
      .get()
  )
    set(db, "installation_id", randomUUID());
  pruneDiagnostics(db);
  return async function ({ req, res, path, url, body, json, authenticate }) {
    const authorize = () => {
      const user = authenticate();
      if (!user) throw fail(401, "Please sign in");
      if (user.role !== "administrator")
        throw fail(403, "Administrator access required");
      if (req.method === "POST" && req.headers["x-csrf-token"] !== user.csrf)
        throw fail(403, "CSRF token rejected");
      return user;
    };
    let user = authorize();
    const permitted = () => {
      if (!config.diagnosticsAllowed || !get(db, "enabled"))
        throw fail(403, "Diagnostics are disabled");
    };
    const context = () => {
      let row = db
        .prepare(
          "SELECT context_id FROM diagnostic_sessions WHERE session_hash=?",
        )
        .get(user.sessionHash);
      if (!row) {
        row = { context_id: randomUUID() };
        db.prepare("INSERT INTO diagnostic_sessions VALUES(?,?)").run(
          user.sessionHash,
          row.context_id,
        );
      }
      return {
        allowed: config.diagnosticsAllowed === true,
        enabled: get(db, "enabled"),
        retentionDays: get(db, "retention_days"),
        generation: get(db, "generation"),
        installationId: get(db, "installation_id"),
        administratorId: user.id,
        sessionContext: row.context_id,
        applicationVersion: version,
        limits: LIMITS,
      };
    };
    pruneDiagnostics(db);
    const base = "/api/admin/diagnostics";
    if (path === base + "/context" && req.method === "GET")
      return json(res, 200, context());
    if (path === base + "/settings" && req.method === "POST") {
      const data = await body(req);
      user = authorize();
      if (
        typeof data.enabled !== "boolean" ||
        !Number.isInteger(data.retentionDays) ||
        data.retentionDays < 1 ||
        data.retentionDays > 30
      )
        throw fail(400, "Choose enablement and 1–30 retention days");
      if (data.enabled && !config.diagnosticsAllowed)
        throw fail(403, "Server operator has disabled diagnostics");
      if (data.enabled !== get(db, "enabled"))
        set(db, "generation", get(db, "generation") + 1);
      set(db, "enabled", data.enabled);
      set(db, "retention_days", data.retentionDays);
      pruneDiagnostics(db);
      return json(res, 200, context());
    }
    if (path === base + "/recordings" && req.method === "POST") {
      const data = await body(req);
      user = authorize();
      permitted();
      if (
        typeof data.recordingId !== "string" ||
        !UUID.test(data.recordingId) ||
        !Number.isSafeInteger(data.startedAt) ||
        Math.abs(Date.now() - data.startedAt) > 300000
      )
        throw fail(400, "Invalid recording");
      if (
        db
          .prepare(
            "SELECT count(*) AS n FROM diagnostic_recordings WHERE owner_id=?",
          )
          .get(user.id).n >= 50 ||
        db.prepare("SELECT count(*) AS n FROM diagnostic_recordings").get().n >=
          1000
      )
        throw fail(429, "Recording limit reached");
      if (
        db
          .prepare(
            "SELECT 1 FROM diagnostic_recordings WHERE id=? UNION SELECT 1 FROM diagnostic_reports WHERE id=?",
          )
          .get(data.recordingId, data.recordingId)
      )
        throw fail(409, "Recording already registered");
      const ctx = context();
      db.prepare(
        "INSERT INTO diagnostic_recordings(id,owner_id,session_hash,context_id,generation,started_at,registered_at) VALUES(?,?,?,?,?,?,?)",
      ).run(
        data.recordingId,
        user.id,
        user.sessionHash,
        ctx.sessionContext,
        ctx.generation,
        data.startedAt,
        Date.now(),
      );
      return json(res, 201, { recordingId: data.recordingId });
    }
    if (path === base + "/reports" && req.method === "POST") {
      permitted();
      const data = await body(req, LIMITS.bytes + 65536);
      user = authorize();
      permitted();
      if (
        typeof data.recordingId !== "string" ||
        !UUID.test(data.recordingId) ||
        typeof data.sessionContext !== "string" ||
        !UUID.test(data.sessionContext) ||
        typeof data.installationId !== "string" ||
        !UUID.test(data.installationId)
      )
        throw fail(400, "Invalid recording envelope");
      const row = db
        .prepare(
          "SELECT * FROM diagnostic_recordings WHERE id=? AND owner_id=? AND session_hash=?",
        )
        .get(data.recordingId, user.id, user.sessionHash);
      if (
        !row ||
        row.context_id !== data.sessionContext ||
        data.installationId !== get(db, "installation_id") ||
        row.generation !== get(db, "generation")
      )
        throw fail(403, "Original recording session required");
      let report;
      try {
        report = validateReport(data.report);
      } catch {
        throw fail(400, "Invalid diagnostic report");
      }
      if (
        report.recordingId !== row.id ||
        Date.parse(report.startedAt) !== row.started_at
      )
        throw fail(400, "Recording mismatch");
      const content = JSON.stringify(report),
        bytes = Buffer.byteLength(content);
      if (bytes > LIMITS.bytes) throw fail(413, "Report too large");
      const digest = createHash("sha256").update(content).digest("hex");
      if (row.digest) {
        if (row.digest !== digest) throw fail(409, "Conflicting duplicate");
        if (
          !db
            .prepare("SELECT 1 FROM diagnostic_reports WHERE id=?")
            .get(row.report_id)
        )
          throw fail(410, "Report was deleted");
        return json(res, 200, { reportId: row.report_id, saved: true });
      }
      if (
        db
          .prepare(
            "SELECT count(*) AS n FROM diagnostic_reports WHERE owner_id=?",
          )
          .get(user.id).n >= 20 ||
        db.prepare("SELECT count(*) AS n FROM diagnostic_reports").get().n >=
          100
      )
        throw fail(507, "Report quota reached; delete older reports");
      const now = Date.now(),
        metadata = {
          id: row.id,
          recordingId: row.id,
          startedAt: report.startedAt,
          endedAt: report.endedAt,
          uploadedAt: new Date(now).toISOString(),
          durationMs: report.durationMs,
          reason: report.reason,
          eventCount: report.events.length,
          sizeBytes: bytes,
          categories: [...new Set(report.events.map((e) => e.category))],
          reportVersion: report.reportVersion,
          applicationVersion: report.applicationVersion,
          browser: report.browser,
          status: "Saved",
        };
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT INTO diagnostic_reports VALUES(?,?,?,?,?)").run(
          row.id,
          user.id,
          now,
          JSON.stringify(metadata),
          content,
        );
        db.prepare(
          "UPDATE diagnostic_recordings SET digest=?,report_id=? WHERE id=?",
        ).run(digest, row.id, row.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return json(res, 201, { reportId: row.id, saved: true });
    }
    if (path === base + "/reports" && req.method === "GET") {
      const offset = Math.max(
        0,
        Math.min(100, Number(url.searchParams.get("offset")) || 0),
      );
      return json(res, 200, {
        reports: db
          .prepare(
            "SELECT metadata FROM diagnostic_reports WHERE owner_id=? ORDER BY uploaded_at DESC,id LIMIT 20 OFFSET ?",
          )
          .all(user.id, offset)
          .map((r) => JSON.parse(r.metadata)),
      });
    }
    const match =
      /^\/api\/admin\/diagnostics\/reports\/([a-f0-9-]{36})(?:\/(export|delete))?$/.exec(
        path,
      );
    if (match) {
      if (req.method === "POST") {
        await body(req);
        user = authorize();
      }
      const report = db
        .prepare(
          "SELECT content FROM diagnostic_reports WHERE id=? AND owner_id=?",
        )
        .get(match[1], user.id);
      if (!report) throw fail(404, "Report not found");
      if (req.method === "POST" && match[2] === "delete") {
        db.prepare(
          "DELETE FROM diagnostic_reports WHERE id=? AND owner_id=?",
        ).run(match[1], user.id);
        return json(res, 200, { deleted: true });
      }
      if (req.method === "GET" && match[2] !== "delete")
        return json(
          res,
          200,
          JSON.parse(report.content),
          match[2] === "export"
            ? {
                "Content-Disposition": `attachment; filename="diagnostic-${match[1]}.json"`,
              }
            : {},
        );
    }
    throw fail(404, "Diagnostic endpoint not found");
  };
}
