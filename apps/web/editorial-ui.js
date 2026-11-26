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
import {
  renderDocument,
  utcTimestamp,
  externalURL,
} from "./editorial-format.js";
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(parent, label, action, className) {
  const node = element("button", label, className);
  node.type = "button";
  node.addEventListener("click", action);
  parent.append(node);
  return node;
}
export function prominenceBadge(value) {
  if (value === "normal") return null;
  const badge = element(
    "span",
    value === "top" ? "Top Pin" : "Pin",
    "article-prominence",
  );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    path = document.createElementNS(svg.namespaceURI, "path");
  svg.classList.add("icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.symbol = value === "top" ? "star" : "pin";
  path.setAttribute(
    "d",
    value === "top"
      ? "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"
      : "m15 3 6 6-4 1-4 5-1 4-7-7 4-1 5-4Z M8 16l-5 5",
  );
  svg.append(path);
  badge.prepend(svg);
  return badge;
}

export function renderArticle(parent, article, { preview = false } = {}) {
  parent.replaceChildren();
  const badge = prominenceBadge(article.prominence);
  if (badge) parent.append(badge);
  parent.append(element("h1", article.title));
  if (preview)
    parent.append(
      element(
        "p",
        article.status === "draft"
          ? "Private draft preview — only administrators can see this."
          : "Private article preview",
        "help",
      ),
    );
  const body = element("div", undefined, "article-body");
  renderDocument(body, article.body);
  parent.append(body);
  if (article.images.length) {
    const gallery = element("div", undefined, "article-gallery");
    for (const image of article.images) {
      const figure = element("figure"),
        img = element("img");
      img.src = `/api/blog/images/${image.id}`;
      img.alt = image.alt;
      img.loading = "lazy";
      img.decoding = "async";
      figure.append(img);
      if (image.caption) figure.append(element("figcaption", image.caption));
      gallery.append(figure);
    }
    parent.append(gallery);
  }
  const dates = element("footer", undefined, "article-dates");
  if (article.published_at !== null) {
    const published = element("p", "Published: "),
      time = element("time", utcTimestamp(article.published_at));
    time.dateTime = new Date(article.published_at).toISOString();
    published.append(time);
    dates.append(published);
    if (article.updated_at !== article.published_at) {
      const updated = element("p", "Updated: "),
        t = element("time", utcTimestamp(article.updated_at));
      t.dateTime = new Date(article.updated_at).toISOString();
      updated.append(t);
      dates.append(updated);
    }
  } else if (preview) dates.append(element("p", "Not published"));
  parent.append(dates);
}
const platformPaths = {
  external: [
    "M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
  ],
  instagram: [
    "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z",
    "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    "M17 7h.01",
  ],
  youtube: [
    "M21 8s0-3-3-3H6C3 5 3 8 3 8v8s0 3 3 3h12c3 0 3-3 3-3Z",
    "m10 9 5 3-5 3Z",
  ],
  tiktok: ["M14 3v12a4 4 0 1 1-4-4", "M14 3c0 5 4 6 6 6"],
  facebook: ["M15 21V5c0-2 2-2 4-2", "M10 10h9"],
  x: ["m4 3 16 18M20 3 4 21"],
  bluesky: [
    "M12 12C3-5-2 8 12 17 26 8 21-5 12 12Z",
    "M12 15C1 7 3 25 12 18 21 25 23 7 12 15Z",
  ],
  mastodon: [
    "M4 17V7c0-5 16-5 16 0v8c0 4-11 5-13 2v4h7",
    "M7 13V8c0-3 5-3 5 0v5M12 8c0-3 5-3 5 0v5",
  ],
  threads: [
    "M20 8C18 0 4 1 4 12c0 12 16 11 16 3 0-7-11-7-11-2 0 5 9 3 7-4-1-3-5-4-7-1",
  ],
  linkedin: ["M3 3h18v18H3Z", "M7 10v7M7 7h.01M11 17v-7M11 13c0-4 6-4 6 0v4"],
  bandcamp: ["m7 5 14 0-4 14H3Z"],
  soundcloud: [
    "M13 17h6a4 4 0 0 0 0-8 5 5 0 0 0-8-3v11",
    "M3 12v4M6 9v8M9 7v10",
  ],
  generic: [
    "M9 15 15 9",
    "M8 16H6a4 4 0 0 1 0-8h4",
    "M16 8h2a4 4 0 0 1 0 8h-4",
  ],
};
export function socialIcon(platform) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("social-icon");
  for (const d of platformPaths[platform] || platformPaths.generic) {
    const p = document.createElementNS(svg.namespaceURI, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}
export function mountEditorialReader({ blogRoot, socialRoot, api }) {
  let generation = 0,
    articleId = null,
    blogRequest = 0,
    socialRequest = 0,
    offset = null,
    list = [],
    busy = false,
    mode = "player";
  function clear() {
    generation++;
    articleId = null;
    blogRequest++;
    socialRequest++;
    offset = null;
    list = [];
    busy = false;
    blogRoot.replaceChildren();
    socialRoot.replaceChildren();
  }
  function failure(root, error) {
    root.replaceChildren(element("p", error.message, "editorial-error"));
    button(root, "Try again", () => show(mode));
  }
  async function loadList(more = false) {
    const g = generation;
    if (busy) return;
    busy = true;
    const request = ++blogRequest;
    try {
      const data = await api("/api/blog" + (more ? `?offset=${offset}` : ""));
      if (g !== generation || request !== blogRequest) return;
      list = more
        ? [
            ...list,
            ...data.articles.filter((a) => !list.some((b) => b.id === a.id)),
          ]
        : data.articles;
      offset = data.nextOffset;
      articleId = null;
      renderList();
    } catch (error) {
      if (g === generation && request === blogRequest) failure(blogRoot, error);
    } finally {
      if (g === generation) busy = false;
    }
  }
  function headingFocus(root) {
    const h = root.querySelector("h1");
    if (h) {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    }
  }
  function renderList() {
    blogRoot.replaceChildren();
    const head = element("div", undefined, "section-heading");
    head.append(element("h1", "Artist Blog"));
    button(head, "Refresh articles", () => loadList());
    blogRoot.append(
      head,
      element(
        "p",
        "Writing, photographs and updates from the artist.",
        "section-intro",
      ),
    );
    if (!list.length)
      blogRoot.append(
        element("p", "No articles published yet.", "editorial-empty"),
      );
    const entries = element("div", undefined, "article-list");
    for (const row of list) {
      const card = element(
        "article",
        undefined,
        "article-card" + (row.prominence === "top" ? " top-article" : ""),
      );
      if (row.preview_image) {
        const image = element("img");
        image.src = `/api/blog/images/${row.preview_image}`;
        image.alt = "";
        image.loading = "lazy";
        card.append(image);
      }
      const content = element("div");
      const badge = prominenceBadge(row.prominence);
      if (badge) content.append(badge);
      const h = element("h2");
      button(
        h,
        row.title,
        () => openArticle(row.id, true),
        "article-title-button",
      );
      content.append(h, element("p", row.excerpt));
      const date = element("time", utcTimestamp(row.published_at));
      date.dateTime = new Date(row.published_at).toISOString();
      content.append(date);
      card.append(content);
      entries.append(card);
    }
    blogRoot.append(entries);
    if (offset !== null)
      button(blogRoot, "Load more articles", () => loadList(true), "load-more");
  }
  async function openArticle(id, focus = false) {
    const g = generation,
      request = ++blogRequest;
    articleId = id;
    try {
      const data = await api("/api/blog/" + id);
      if (g !== generation || articleId !== id || request !== blogRequest)
        return;
      blogRoot.replaceChildren();
      button(
        blogRoot,
        "← Back to Blog",
        () => {
          articleId = null;
          renderList();
          blogRoot.scrollTop = 0;
          headingFocus(blogRoot);
        },
        "back-to-blog",
      );
      const article = element("article", undefined, "article-reader");
      renderArticle(article, data.article);
      blogRoot.append(article);
      if (focus) {
        blogRoot.scrollTop = 0;
        headingFocus(blogRoot);
      }
    } catch (error) {
      if (g === generation && request === blogRequest) {
        articleId = null;
        failure(blogRoot, error);
        button(blogRoot, "Back to Blog", () => loadList());
      }
    }
  }
  async function loadSocial() {
    const g = generation,
      request = ++socialRequest;
    try {
      const data = await api("/api/social");
      if (g !== generation || request !== socialRequest) return;
      socialRoot.replaceChildren(
        element("h1", "Find the artist elsewhere"),
        element(
          "p",
          "Visit the artist’s external social profiles. Links open in a new tab.",
          "section-intro",
        ),
      );
      if (!data.links.length)
        socialRoot.append(
          element("p", "No social profiles added yet.", "editorial-empty"),
        );
      const links = element("div", undefined, "social-directory");
      for (const link of data.links) {
        const anchor = element("a", undefined, "social-destination");
        anchor.href = externalURL(link.url);
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.referrerPolicy = "no-referrer";
        anchor.append(
          socialIcon(link.platform),
          element("span", link.label),
          (() => {
            const icon = socialIcon("external");
            icon.classList.add("external-marker");
            return icon;
          })(),
        );
        anchor.setAttribute("aria-label", link.label + " (opens in a new tab)");
        links.append(anchor);
      }
      socialRoot.append(links);
    } catch (error) {
      if (g === generation && request === socialRequest)
        failure(socialRoot, error);
    }
  }
  function show(name) {
    mode = name;
    if (name === "blog") {
      if (articleId) openArticle(articleId);
      else loadList();
    }
    if (name === "social") loadSocial();
  }
  return { show, clear };
}
