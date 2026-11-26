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
import { randomUUID } from "node:crypto";
const fail = (status, message) => Object.assign(new Error(message), { status });
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
export function creditUnits(value) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,3})?$/.test(value)
  )
    throw fail(400, "Use credits with at most three decimal places");
  const [whole, fraction = ""] = value.split(".");
  const units = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  if (units > 1000000000) throw fail(400, "Maximum is 1000000 credits");
  return units;
}
export const creditsEnabled = (db) =>
  db.prepare("SELECT value FROM settings WHERE key='credits_enabled'").get()
    ?.value === "true";
export function wallet(db, userId, now = Date.now()) {
  const user = db
    .prepare("SELECT credit_units,credits_unlimited FROM users WHERE id=?")
    .get(userId);
  const held = db
    .prepare(
      "SELECT coalesce(sum(held_units),0) AS n FROM play_engagements WHERE user_id=? AND state='open' AND expires_at>?",
    )
    .get(userId, now).n;
  return {
    enabled: creditsEnabled(db),
    unlimited: Boolean(user.credits_unlimited),
    balanceUnits: user.credit_units,
    heldUnits: held,
    availableUnits: Math.max(0, user.credit_units - held),
    unitsPerCredit: 1000,
  };
}
function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function listeningService(db, now = () => Date.now()) {
  function prune() {
    const time = now();
    db.prepare(
      "UPDATE play_engagements SET state='closed',held_units=0 WHERE state='open' AND expires_at<=?",
    ).run(time);
    db.prepare("DELETE FROM qualifying_plays WHERE qualified_at<?").run(
      time - 90 * 86400000,
    );
    db.prepare(
      "DELETE FROM play_engagements WHERE state='qualified' AND qualified_at<? AND NOT EXISTS(SELECT 1 FROM credit_ledger WHERE engagement_id=play_engagements.id)",
    ).run(time - 90 * 86400000);
    // Unqualified starts are short-lived authorization records, never skip analytics.
    db.prepare(
      "DELETE FROM play_engagements WHERE state='closed' AND expires_at<?",
    ).run(time - 7 * 86400000);
  }
  prune();
  return async ({ req, res, path, url, body, json, user, authenticate }) => {
    const admin = path.startsWith("/api/admin/");
    if (admin && user.role !== "administrator")
      throw fail(403, "Administrator required");
    prune();
    if (req.method === "GET") {
      if (path === "/api/listening/account")
        return json(res, 200, wallet(db, user.id, now()));
      if (path === "/api/listening/export") {
        const offset = Number(url.searchParams.get("offset") || 0);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000000)
          throw fail(400, "Invalid export offset");
        const plays = db
          .prepare(
            "SELECT engagement_id,track_id,qualified_at FROM qualifying_plays WHERE user_id=? ORDER BY qualified_at,engagement_id LIMIT 200 OFFSET ?",
          )
          .all(user.id, offset);
        const ledger = db
          .prepare(
            "SELECT id,delta_units,unlimited,reason,created_at FROM credit_ledger WHERE user_id=? ORDER BY created_at,id LIMIT 200 OFFSET ?",
          )
          .all(user.id, offset);
        return json(res, 200, {
          plays,
          ledger,
          account: wallet(db, user.id, now()),
          nextOffset:
            plays.length === 200 || ledger.length === 200 ? offset + 200 : null,
        });
      }
      if (path === "/api/admin/listening")
        return json(res, 200, {
          enabled: creditsEnabled(db),
          retentionDays: 90,
          tracks: db
            .prepare(
              "SELECT tracks.id,tracks.title, count(qualifying_plays.engagement_id) AS plays FROM tracks LEFT JOIN qualifying_plays ON tracks.id=qualifying_plays.track_id GROUP BY tracks.id ORDER BY plays DESC,tracks.title",
            )
            .all(),
          daily: db
            .prepare(
              "SELECT strftime('%Y-%m-%d',qualified_at/1000,'unixepoch') AS day,count(*) AS plays FROM qualifying_plays GROUP BY day ORDER BY day DESC LIMIT 90",
            )
            .all(),
          ledger: db
            .prepare(
              "SELECT credit_ledger.id,users.username,delta_units,reason,credit_ledger.created_at FROM credit_ledger JOIN users ON users.id=credit_ledger.user_id ORDER BY credit_ledger.created_at DESC,credit_ledger.id LIMIT 100",
            )
            .all(),
        });
      throw fail(404, "Listening route not found");
    }
    if (req.method !== "POST") throw fail(404, "Listening route not found");
    const data = await body(req);
    const fresh = authenticate();
    if (
      !fresh ||
      fresh.id !== user.id ||
      (admin && fresh.role !== "administrator")
    )
      throw fail(403, "Session no longer authorized");
    if (path === "/api/admin/listening/settings") {
      if (typeof data.enabled !== "boolean")
        throw fail(400, "Boolean required");
      transaction(db, () => {
        db.prepare(
          "UPDATE settings SET value=? WHERE key='credits_enabled'",
        ).run(JSON.stringify(data.enabled));
        if (!data.enabled)
          db.prepare(
            "UPDATE play_engagements SET held_units=0,mode='disabled' WHERE state='open'",
          ).run();
      });
      return json(res, 200, { ok: true });
    }
    if (path === "/api/admin/listening/listener") {
      if (
        !uuid(data.requestId) ||
        typeof data.unlimited !== "boolean" ||
        typeof data.reason !== "string" ||
        !data.reason.trim() ||
        data.reason.length > 200
      )
        throw fail(400, "Request ID, unlimited choice and reason required");
      if (data.subtract !== undefined && typeof data.subtract !== "boolean")
        throw fail(400, "Boolean adjustment direction required");
      const amount = creditUnits(data.amount),
        delta = data.subtract === true ? -amount : amount;
      const result = transaction(db, () => {
        const previous = db
          .prepare("SELECT * FROM credit_ledger WHERE id=?")
          .get(data.requestId);
        if (previous) {
          if (
            previous.user_id !== data.userId ||
            previous.actor_id !== user.id ||
            previous.delta_units !== delta ||
            previous.reason !== data.reason.trim() ||
            previous.unlimited !== Number(data.unlimited)
          )
            throw fail(409, "Request ID already used");
          return { ok: true, replayed: true };
        }
        const account = db
          .prepare("SELECT id,credit_units FROM users WHERE id=?")
          .get(data.userId);
        if (!account) throw fail(404, "Listener not found");
        const balance = wallet(db, account.id, now());
        if (
          account.credit_units + delta < balance.heldUnits ||
          account.credit_units + delta > 1000000000
        )
          throw fail(
            409,
            "Adjustment exceeds available credits or balance limit",
          );
        db.prepare(
          "UPDATE users SET credit_units=credit_units+?,credits_unlimited=? WHERE id=?",
        ).run(delta, Number(data.unlimited), account.id);
        // Enabling unlimited immediately releases pending holds; never charges their old price.
        if (data.unlimited)
          db.prepare(
            "UPDATE play_engagements SET held_units=0,mode='unlimited' WHERE user_id=? AND state='open'",
          ).run(account.id);
        db.prepare("INSERT INTO credit_ledger VALUES(?,?,?,?,?,?,?,?)").run(
          data.requestId,
          account.id,
          user.id,
          null,
          delta,
          Number(data.unlimited),
          data.reason.trim(),
          now(),
        );
        return { ok: true };
      });
      return json(res, 200, result);
    }
    if (path === "/api/listening/erase") {
      db.prepare(
        "UPDATE qualifying_plays SET user_id=NULL WHERE user_id=?",
      ).run(user.id);
      return json(res, 200, { ok: true });
    }
    if (path === "/api/listening/start") {
      if (
        !uuid(data.id) ||
        typeof data.trackId !== "string" ||
        !Number.isSafeInteger(data.durationMs) ||
        data.durationMs <= 0 ||
        data.durationMs > 86400000
      )
        throw fail(400, "Valid engagement, track and duration required");
      const result = transaction(db, () => {
        const previous = db
          .prepare("SELECT * FROM play_engagements WHERE id=?")
          .get(data.id);
        if (previous) {
          if (
            previous.user_id !== user.id ||
            previous.track_id !== data.trackId ||
            previous.duration_ms !== data.durationMs
          )
            throw fail(409, "Engagement ID already used");
          if (previous.expires_at <= now() || previous.state === "closed")
            throw fail(410, "Engagement expired or closed");
          return {
            id: previous.id,
            priceUnits: previous.price_units,
            mode: previous.mode,
          };
        }
        const track = db
          .prepare("SELECT id,price_units FROM tracks WHERE id=? AND visible=1")
          .get(data.trackId);
        if (!track) throw fail(404, "Track unavailable");
        if (data.previousId !== undefined) {
          if (!uuid(data.previousId) || data.previousId === data.id)
            throw fail(400, "Invalid previous engagement");
          db.prepare(
            "UPDATE play_engagements SET state='closed',held_units=0 WHERE id=? AND user_id=? AND state='open'",
          ).run(data.previousId, user.id);
        }
        const account = wallet(db, user.id, now());
        if (
          data.expectedPriceUnits !== track.price_units ||
          data.expectedCharging !== account.enabled
        )
          throw fail(
            409,
            "Track price or charging policy changed. Reload the catalog before starting a paid engagement.",
          );
        const mode = !account.enabled
          ? "disabled"
          : account.unlimited
            ? "unlimited"
            : data.durationMs < 60000
              ? "short"
              : "metered";
        const price = mode === "metered" ? track.price_units : 0;
        if (price > account.availableUnits)
          throw fail(
            402,
            "Not enough credits for this track. Ask the artist for credits or choose a free track.",
          );
        if (
          db
            .prepare(
              "SELECT count(*) AS n FROM play_engagements WHERE user_id=? AND state='open'",
            )
            .get(user.id).n >= 50
        )
          throw fail(429, "Too many active listening engagements");
        db.prepare(
          "INSERT INTO play_engagements(id,user_id,track_id,started_at,expires_at,duration_ms,price_units,held_units,mode) VALUES(?,?,?,?,?,?,?,?,?)",
        ).run(
          data.id,
          user.id,
          track.id,
          now(),
          now() + 86400000,
          data.durationMs,
          price,
          price,
          mode,
        );
        return { id: data.id, priceUnits: price, mode };
      });
      return json(res, 200, { ...result, account: wallet(db, user.id, now()) });
    }
    if (path === "/api/listening/qualify" || path === "/api/listening/close") {
      if (!uuid(data.id)) throw fail(400, "Valid engagement required");
      const result = transaction(db, () => {
        const e = db
          .prepare("SELECT * FROM play_engagements WHERE id=? AND user_id=?")
          .get(data.id, user.id);
        if (!e) throw fail(404, "Engagement not found");
        if (e.state === "qualified")
          return { qualified: true, chargedUnits: e.charged_units };
        if (path.endsWith("/close")) {
          db.prepare(
            "UPDATE play_engagements SET state='closed',held_units=0 WHERE id=?",
          ).run(e.id);
          return { qualified: false };
        }
        if (e.state !== "open" || e.expires_at <= now())
          throw fail(410, "Engagement expired or closed");
        if (
          e.duration_ms < 60000 ||
          data.playedMs !== 60000 ||
          now() - e.started_at < 60000
        )
          throw fail(400, "60 seconds of observed playback required");
        const account = wallet(db, user.id, now());
        const price =
          account.enabled && !account.unlimited && e.mode === "metered"
            ? e.price_units
            : 0;
        db.prepare(
          "UPDATE users SET credit_units=credit_units-? WHERE id=?",
        ).run(price, user.id);
        if (price)
          db.prepare("INSERT INTO credit_ledger VALUES(?,?,?,?,?,?,?,?)").run(
            randomUUID(),
            user.id,
            null,
            e.id,
            -price,
            null,
            "Qualifying play",
            now(),
          );
        db.prepare(
          "UPDATE play_engagements SET state='qualified',qualified_at=?,charged_units=?,held_units=0 WHERE id=?",
        ).run(now(), price, e.id);
        db.prepare("INSERT INTO qualifying_plays VALUES(?,?,?,?)").run(
          e.id,
          user.id,
          e.track_id,
          now(),
        );
        return { qualified: true, chargedUnits: price };
      });
      return json(res, 200, { ...result, account: wallet(db, user.id, now()) });
    }
    throw fail(404, "Listening route not found");
  };
}
