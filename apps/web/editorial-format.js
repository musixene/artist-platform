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
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export const socialPlatforms = [
  "generic",
  "instagram",
  "youtube",
  "tiktok",
  "facebook",
  "x",
  "bluesky",
  "mastodon",
  "threads",
  "linkedin",
  "bandcamp",
  "soundcloud",
];
export function externalURL(value) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    throw invalid("Use an external HTTPS URL without spaces or credentials");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalid("Use a complete HTTPS URL");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw invalid("Only HTTPS destinations without credentials are allowed");
  return url.href;
}
export function articleDocument(value) {
  if (
    !Array.isArray(value) ||
    value.length > 500 ||
    new TextEncoder().encode(JSON.stringify(value)).length > 64000
  )
    throw invalid(
      "Article is too large; use up to 500 paragraphs/list blocks and 64 KB of formatted text",
    );
  const inline = (items) => {
    if (!Array.isArray(items) || items.length > 1000)
      throw invalid("Invalid article text");
    return items.map((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).some(
          (k) => !["text", "bold", "italic", "href"].includes(k),
        ) ||
        typeof item.text !== "string" ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item.text)
      )
        throw invalid("Only text, emphasis and HTTPS links are supported");
      const result = { text: item.text };
      for (const mark of ["bold", "italic"])
        if (item[mark] !== undefined) {
          if (typeof item[mark] !== "boolean")
            throw invalid("Invalid text style");
          if (item[mark]) result[mark] = true;
        }
      if (item.href !== undefined) result.href = externalURL(item.href);
      return result;
    });
  };
  return value.map((block) => {
    if (!block || typeof block !== "object" || Array.isArray(block))
      throw invalid("Invalid article block");
    if (block.type === "paragraph" || block.type === "heading") {
      if (
        Object.keys(block).some(
          (k) => !["type", "children", "level"].includes(k),
        )
      )
        throw invalid("Unsupported article content");
      const result = { type: block.type, children: inline(block.children) };
      if (block.type === "heading") {
        if (![2, 3].includes(block.level))
          throw invalid("Choose heading level 2 or 3");
        result.level = block.level;
      }
      return result;
    }
    if (block.type === "list") {
      if (
        Object.keys(block).some(
          (k) => !["type", "ordered", "items"].includes(k),
        ) ||
        typeof block.ordered !== "boolean" ||
        !Array.isArray(block.items) ||
        block.items.length > 200
      )
        throw invalid("Invalid list");
      return {
        type: "list",
        ordered: block.ordered,
        items: block.items.map(inline),
      };
    }
    throw invalid("Unsupported article block");
  });
}
export function articleText(blocks) {
  return blocks
    .map((b) =>
      b.type === "list"
        ? b.items.map((i) => i.map((t) => t.text).join("")).join(" ")
        : b.children.map((t) => t.text).join(""),
    )
    .join(" ");
}
export function utcTimestamp(value) {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(value))
      .replace(" at ", " · ") + " UTC"
  );
}
export function renderDocument(parent, blocks) {
  parent.replaceChildren();
  function inline(element, items) {
    for (const item of items) {
      let node = document.createTextNode(item.text);
      if (item.bold) {
        const n = document.createElement("strong");
        n.append(node);
        node = n;
      }
      if (item.italic) {
        const n = document.createElement("em");
        n.append(node);
        node = n;
      }
      if (item.href) {
        const n = document.createElement("a");
        n.href = externalURL(item.href);
        n.target = "_blank";
        n.rel = "noopener noreferrer";
        n.append(node);
        node = n;
      }
      element.append(node);
    }
  }
  for (const block of articleDocument(blocks)) {
    const node = document.createElement(
      block.type === "heading"
        ? "h" + block.level
        : block.type === "list"
          ? block.ordered
            ? "ol"
            : "ul"
          : "p",
    );
    if (block.type === "list") {
      for (const item of block.items) {
        const li = document.createElement("li");
        inline(li, item);
        node.append(li);
      }
    } else inline(node, block.children);
    parent.append(node);
  }
}
