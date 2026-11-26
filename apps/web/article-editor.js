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
  articleDocument,
  externalURL,
  renderDocument,
} from "./editorial-format.js";
import { element, button } from "./editorial-ui.js";
// Editing DOM is never stored or trusted as HTML. Pasted material is plain text.
export function readEditor(root) {
  function inline(node, marks = {}) {
    if (node.nodeType === Node.TEXT_NODE)
      return [{ text: node.textContent, ...marks }];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    if (node.tagName === "BR") return [{ text: "\n", ...marks }];
    const next = { ...marks };
    if (["B", "STRONG"].includes(node.tagName)) next.bold = true;
    if (["I", "EM"].includes(node.tagName)) next.italic = true;
    if (node.tagName === "A") {
      try {
        next.href = externalURL(node.getAttribute("href"));
      } catch {}
    }
    return [...node.childNodes].flatMap((n) => inline(n, next));
  }
  const blocks = [];
  let pending = [];
  function flush() {
    if (pending.some((i) => i.text))
      blocks.push({ type: "paragraph", children: pending });
    pending = [];
  }
  for (const node of root.childNodes) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL"].includes(
        node.tagName,
      )
    ) {
      flush();
      if (["UL", "OL"].includes(node.tagName)) {
        blocks.push({
          type: "list",
          ordered: node.tagName === "OL",
          items: [...node.children]
            .filter((n) => n.tagName === "LI")
            .map((n) => inline(n)),
        });
      } else if (node.querySelector("p,div,h2,h3,ul,ol"))
        blocks.push(...readEditor(node));
      else
        blocks.push({
          type: /^H/.test(node.tagName) ? "heading" : "paragraph",
          ...(/^H/.test(node.tagName)
            ? { level: node.tagName === "H3" ? 3 : 2 }
            : {}),
          children: inline(node),
        });
    } else pending.push(...inline(node));
  }
  flush();
  return articleDocument(blocks);
}
export function createArticleEditor(parent, blocks, onChange) {
  const toolbar = element("div", undefined, "article-toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Article formatting");
  const editor = element("div", undefined, "article-composer");
  editor.contentEditable = "true";
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-label", "Article body");
  editor.setAttribute("aria-multiline", "true");
  editor.spellcheck = true;
  renderDocument(editor, blocks);
  if (!editor.firstChild) editor.append(element("p", ""));
  function command(name, value) {
    editor.focus();
    document.execCommand(name, false, value);
    onChange();
  }
  for (const [label, name, value] of [
    ["Paragraph", "formatBlock", "p"],
    ["Heading", "formatBlock", "h2"],
    ["Subheading", "formatBlock", "h3"],
    ["Bold", "bold"],
    ["Italic", "italic"],
    ["Bulleted list", "insertUnorderedList"],
    ["Numbered list", "insertOrderedList"],
  ]) {
    const b = button(toolbar, label, () => command(name, value));
    b.addEventListener("mousedown", (e) => e.preventDefault());
  }
  const linkButton = button(toolbar, "Insert link", () => {
    const selection = window.getSelection(),
      range = selection.rangeCount
        ? selection.getRangeAt(0).cloneRange()
        : null;
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    const dialog = element("dialog"),
      form = element("form"),
      title = element("h2", "Insert HTTPS link"),
      label = element("label", "Destination URL"),
      url = element("input");
    url.type = "url";
    url.required = true;
    url.setAttribute("aria-label", "Link destination");
    label.append(url);
    const error = element("p");
    error.setAttribute("role", "status");
    form.append(title, label, error);
    const save = element("button", "Insert link");
    save.type = "submit";
    form.append(save);
    button(form, "Cancel", () => dialog.close());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const href = externalURL(url.value);
        editor.focus();
        selection.removeAllRanges();
        selection.addRange(range);
        if (range.collapsed) {
          const a = element("a", href);
          a.href = href;
          range.insertNode(a);
        } else document.execCommand("createLink", false, href);
        dialog.close();
        onChange();
      } catch (e) {
        error.textContent = e.message;
      }
    });
    dialog.append(form);
    parent.append(dialog);
    dialog.addEventListener("close", () => {
      dialog.remove();
      editor.focus();
    });
    dialog.showModal();
    url.focus();
  });
  linkButton.addEventListener("mousedown", (event) => event.preventDefault());
  editor.addEventListener("paste", (event) => {
    event.preventDefault();
    document.execCommand(
      "insertText",
      false,
      event.clipboardData.getData("text/plain"),
    );
    onChange();
  });
  editor.addEventListener("drop", (event) => event.preventDefault());
  editor.addEventListener("input", onChange);
  parent.append(toolbar, editor);
  return { root: editor, value: () => readEditor(editor) };
}
export async function privateImage(file) {
  if (
    !file ||
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("Choose a PNG or JPEG photograph up to 20 MiB");
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    for (let i = 0; i < 8; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      if (canvas.width < 32 || canvas.height < 32)
        throw new Error("Use an image at least 32×32 pixels");
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (blob && blob.size <= 2 * 1024 * 1024)
        return new File([blob], "article.png", { type: "image/png" });
      scale *= 0.75;
    }
    throw new Error("Image is too large. Resize it and try again.");
  } finally {
    bitmap.close();
  }
}
