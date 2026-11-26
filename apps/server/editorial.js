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
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { validateBrandingPNG } from "./branding.js";
import {
  articleDocument,
  articleText,
  externalURL,
  socialPlatforms,
} from "../web/editorial-format.js";
const fail = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });
const idPattern = /^[a-f0-9-]{36}$/;
const rank = "CASE prominence WHEN 'top' THEN 2 WHEN 'pin' THEN 1 ELSE 0 END";
const text = (value, max, empty = false) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw fail(400, `Use text up to ${max} characters`);
  return value.trim();
};
function tx(db, action) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function article(db, id) {
  const value = db.prepare("SELECT * FROM articles WHERE id=?").get(id);
  if (!value) throw fail(404, "Article not found");
  return value;
}
function expected(row, data) {
  if (!Number.isSafeInteger(data.revision) || row.revision !== data.revision)
    throw fail(
      409,
      "This article changed. Reload it before saving; your unsaved text is still in the editor.",
    );
}
function contentTime(row, now) {
  return row.published_at === null ? null : Math.max(now, row.updated_at + 1);
}
function imageRows(db, id) {
  return db
    .prepare(
      "SELECT id,alt,caption,position FROM article_images WHERE article_id=? ORDER BY position,id",
    )
    .all(id);
}
function view(db, row, admin = false) {
  const value = {
    id: row.id,
    title: row.title,
    body: JSON.parse(row.body),
    prominence: row.prominence,
    published_at: row.published_at,
    updated_at: row.updated_at,
    images: imageRows(db, row.id),
  };
  if (admin)
    Object.assign(value, {
      status: row.status,
      created_at: row.created_at,
      revision: row.revision,
    });
  return value;
}
function pagination(url) {
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000000)
    throw fail(400, "Invalid page");
  return offset;
}
async function imageBytes(req) {
  if (req.headers["content-type"] !== "image/png")
    throw fail(
      415,
      "Upload a PNG; the editor converts JPEG photographs locally",
    );
  const limit = 2 * 1024 * 1024;
  if (Number(req.headers["content-length"]) > limit)
    throw fail(413, "Image limit is 2 MiB");
  let length = 0;
  const parts = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw fail(413, "Image limit is 2 MiB");
    parts.push(chunk);
  }
  const data = Buffer.concat(parts);
  const size = validateBrandingPNG(data, "blog");
  if (size.width < 32 || size.height < 32)
    throw fail(400, "Blog images must be at least 32×32 pixels");
  return data;
}
export function editorialService(db, config, now = () => Date.now()) {
  const directory = join(config.dataDir, "editorial-images");
  const removeFile = (filename) =>
    /^[a-f0-9-]{36}\.png$/.test(filename)
      ? unlink(join(directory, filename)).catch((error) => {
          if (error.code !== "ENOENT")
            console.error("Private article image cleanup failed");
        })
      : Promise.resolve();
  return async ({ req, res, path, url, body, json, user, authenticate }) => {
    const admin = path.startsWith("/api/admin/");
    if (admin && user.role !== "administrator")
      throw fail(403, "Administrator required");
    const authorize = () => {
      const fresh = authenticate();
      if (
        !fresh ||
        fresh.id !== user.id ||
        (admin && fresh.role !== "administrator")
      )
        throw fail(403, "Session no longer authorized");
      return fresh;
    };
    const imageRoute = /^\/api\/blog\/images\/([a-f0-9-]{36})$/.exec(path);
    if (imageRoute && ["GET", "HEAD"].includes(req.method)) {
      const allowed = () =>
        db
          .prepare(
            "SELECT article_images.filename FROM article_images JOIN articles ON articles.id=article_images.article_id WHERE article_images.id=? AND (articles.status='published' OR ?=1)",
          )
          .get(imageRoute[1], Number(authenticate()?.role === "administrator"));
      let file = allowed();
      if (!file || !/^[a-f0-9-]{36}\.png$/.test(file.filename))
        throw fail(404, "Image not found");
      const bytes = await readFile(join(directory, file.filename)).catch(() => {
        throw fail(404, "Image not found");
      });
      authorize();
      if (!allowed()) throw fail(404, "Image not found");
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": bytes.length,
        "Cache-Control": "no-store",
        "Content-Disposition": "inline",
      });
      return res.end(req.method === "HEAD" ? undefined : bytes);
    }
    const articleRoute =
      /^\/api\/(?:admin\/articles|blog)\/([a-f0-9-]{36})(?:\/(publish|unpublish|prominence|delete|images))?$/.exec(
        path,
      );
    const imageEdit =
      /^\/api\/admin\/articles\/([a-f0-9-]{36})\/images\/([a-f0-9-]{36})(?:\/(delete))?$/.exec(
        path,
      );
    if (req.method === "GET") {
      if (path === "/api/social" || path === "/api/admin/social")
        return json(res, 200, {
          links: db
            .prepare(
              `SELECT ${admin ? "*" : "id,label,url,platform,position"} FROM social_links ${admin ? "" : "WHERE enabled=1"} ORDER BY position,id`,
            )
            .all(),
        });
      if (path === "/api/blog" || path === "/api/admin/articles") {
        const offset = pagination(url),
          limit = 12;
        const rows = db
          .prepare(
            `SELECT id,title,excerpt,status,prominence,created_at,published_at,updated_at,revision,(SELECT id FROM article_images WHERE article_id=articles.id ORDER BY position,id LIMIT 1) AS preview_image FROM articles ${admin ? "" : "WHERE status='published'"} ORDER BY ${admin ? "CASE status WHEN 'draft' THEN 0 ELSE 1 END,created_at DESC,id DESC" : rank + " DESC,published_at DESC,id DESC"} LIMIT ? OFFSET ?`,
          )
          .all(limit + 1, offset);
        const items = rows
          .slice(0, limit)
          .map((row) =>
            admin
              ? row
              : (({ status, created_at, revision, ...rest }) => rest)(row),
          );
        return json(res, 200, {
          articles: items,
          nextOffset: rows.length > limit ? offset + limit : null,
        });
      }
      if (articleRoute && !articleRoute[2]) {
        const row = article(db, articleRoute[1]);
        if (!admin && row.status !== "published")
          throw fail(404, "Article not found");
        return json(res, 200, { article: view(db, row, admin) });
      }
      throw fail(404, "Editorial route not found");
    }
    if (req.method !== "POST" || !admin)
      throw fail(404, "Editorial route not found");
    if (articleRoute?.[2] === "images") {
      const revision = Number(url.searchParams.get("revision"));
      const bytes = await imageBytes(req);
      authorize();
      const filename = randomUUID() + ".png",
        id = randomUUID();
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const file = await open(join(directory, filename), "wx", 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
        authorize();
        tx(db, () => {
          const row = article(db, articleRoute[1]);
          expected(row, { revision });
          if (imageRows(db, row.id).length >= 12)
            throw fail(409, "Use at most 12 supporting images per article");
          db.prepare("INSERT INTO article_images VALUES(?,?,?,?,?,?,?)").run(
            id,
            row.id,
            filename,
            "",
            "",
            imageRows(db, row.id).length,
            now(),
          );
          db.prepare(
            "UPDATE articles SET revision=revision+1,updated_at=? WHERE id=?",
          ).run(contentTime(row, now()), row.id);
        });
      } catch (error) {
        await removeFile(filename);
        throw error;
      } finally {
        await file.close();
      }
      return json(res, 201, {
        article: view(db, article(db, articleRoute[1]), true),
      });
    }
    const data = await body(req, 100000);
    authorize();
    if (path === "/api/admin/articles") {
      const title = text(data.title, 200),
        blocks = articleDocument(data.body ?? []),
        id = randomUUID();
      db.prepare(
        "INSERT INTO articles(id,title,body,excerpt,created_at) VALUES(?,?,?,?,?)",
      ).run(
        id,
        title,
        JSON.stringify(blocks),
        articleText(blocks).slice(0, 240),
        now(),
      );
      return json(res, 201, { article: view(db, article(db, id), true) });
    }
    if (articleRoute) {
      const id = articleRoute[1],
        action = articleRoute[2];
      let conflict;
      const result = tx(db, () => {
        const row = article(db, id);
        expected(row, data);
        if (action === "delete") {
          const files = db
            .prepare("SELECT filename FROM article_images WHERE article_id=?")
            .all(id);
          db.prepare("DELETE FROM articles WHERE id=?").run(id);
          return { deleted: true, files };
        }
        if (action === "publish" || action === "unpublish") {
          const status = action === "publish" ? "published" : "draft";
          if (row.status !== status) {
            const timestamp = now();
            db.prepare(
              "UPDATE articles SET status=?,published_at=coalesce(published_at,?),updated_at=CASE WHEN published_at IS NULL THEN ? ELSE updated_at END,prominence=CASE WHEN ?='draft' AND prominence='top' THEN 'pin' ELSE prominence END,revision=revision+1 WHERE id=?",
            ).run(
              status,
              status === "published" ? timestamp : null,
              status === "published" ? timestamp : null,
              status,
              id,
            );
          }
        } else if (action === "prominence") {
          if (!["normal", "pin", "top"].includes(data.prominence))
            throw fail(400, "Invalid article prominence");
          if (data.prominence === "top" && row.status !== "published")
            throw fail(409, "Publish the article before assigning Top Pin");
          let selected = data.prominence;
          if (selected === "top" && row.prominence !== "top") {
            const top = db
              .prepare(
                "SELECT id,title,revision FROM articles WHERE prominence='top'",
              )
              .get();
            if (top) {
              if (
                !["replace", "pin"].includes(data.resolution) ||
                data.expectedTopId !== top.id ||
                data.expectedTopRevision !== top.revision
              ) {
                conflict = top;
                return null;
              }
              if (data.resolution === "replace")
                db.prepare(
                  "UPDATE articles SET prominence='pin',revision=revision+1 WHERE id=?",
                ).run(top.id);
              else selected = "pin";
            } else if (data.expectedTopId) {
              throw fail(409, "Top Pin changed. Try assigning it again.");
            }
          }
          if (row.prominence !== selected)
            db.prepare(
              "UPDATE articles SET prominence=?,revision=revision+1 WHERE id=?",
            ).run(selected, id);
        } else if (!action) {
          const title = text(data.title, 200),
            blocks = articleDocument(data.body),
            encoded = JSON.stringify(blocks);
          if (title !== row.title || encoded !== row.body)
            db.prepare(
              "UPDATE articles SET title=?,body=?,excerpt=?,updated_at=?,revision=revision+1 WHERE id=?",
            ).run(
              title,
              encoded,
              articleText(blocks).slice(0, 240),
              contentTime(row, now()),
              id,
            );
        } else throw fail(404, "Article action not found");
        return { article: view(db, article(db, id), true) };
      });
      if (conflict)
        return json(res, 409, {
          error: "Another article already has Top Pin.",
          topPin: conflict,
        });
      if (result.deleted) {
        await Promise.all(result.files.map((f) => removeFile(f.filename)));
        return json(res, 200, { deleted: true });
      }
      return json(res, 200, result);
    }
    if (imageEdit) {
      let removed;
      tx(db, () => {
        const row = article(db, imageEdit[1]);
        expected(row, data);
        const image = db
          .prepare("SELECT * FROM article_images WHERE id=? AND article_id=?")
          .get(imageEdit[2], row.id);
        if (!image) throw fail(404, "Image not found");
        if (imageEdit[3]) {
          removed = image.filename;
          db.prepare("DELETE FROM article_images WHERE id=?").run(image.id);
        } else {
          const alt = text(data.alt, 300, true),
            caption = text(data.caption, 500, true);
          if (
            !Number.isSafeInteger(data.position) ||
            data.position < 0 ||
            data.position > 1000
          )
            throw fail(400, "Invalid image order");
          if (
            alt === image.alt &&
            caption === image.caption &&
            data.position === image.position
          )
            return;
          db.prepare(
            "UPDATE article_images SET alt=?,caption=?,position=? WHERE id=?",
          ).run(alt, caption, data.position, image.id);
        }
        db.prepare(
          "UPDATE articles SET updated_at=?,revision=revision+1 WHERE id=?",
        ).run(contentTime(row, now()), row.id);
      });
      if (removed) await removeFile(removed);
      return json(res, 200, {
        article: view(db, article(db, imageEdit[1]), true),
      });
    }
    if (
      path === "/api/admin/social" ||
      /^\/api\/admin\/social\/[a-f0-9-]{36}(?:\/delete)?$/.test(path)
    ) {
      const id = path.split("/")[4] || randomUUID();
      tx(db, () => {
        const previous = db
          .prepare("SELECT * FROM social_links WHERE id=?")
          .get(id);
        if (path !== "/api/admin/social") {
          if (!previous) throw fail(404, "Social link not found");
          if (data.revision !== previous.revision)
            throw fail(409, "Social link changed. Reload before saving.");
        }
        if (path.endsWith("/delete")) {
          db.prepare("DELETE FROM social_links WHERE id=?").run(id);
          return;
        }
        const label = text(data.label, 80),
          url = externalURL(data.url);
        if (new URL(url).origin === new URL(config.origin).origin)
          throw fail(
            400,
            "Choose an external social profile, not an internal application URL",
          );
        if (
          !socialPlatforms.includes(data.platform) ||
          !Number.isSafeInteger(data.position) ||
          data.position < 0 ||
          data.position > 1000000 ||
          typeof data.enabled !== "boolean"
        )
          throw fail(400, "Invalid social platform, order or enabled choice");
        if (
          !previous &&
          db.prepare("SELECT count(*) AS n FROM social_links").get().n >= 100
        )
          throw fail(409, "Use at most 100 social links");
        db.prepare(
          "INSERT INTO social_links(id,label,url,platform,position,enabled) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,url=excluded.url,platform=excluded.platform,position=excluded.position,enabled=excluded.enabled,revision=social_links.revision+1",
        ).run(
          id,
          label,
          url,
          data.platform,
          data.position,
          Number(data.enabled),
        );
      });
      return json(res, 200, { ok: true });
    }
    throw fail(404, "Editorial route not found");
  };
}
