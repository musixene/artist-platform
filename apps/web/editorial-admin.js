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
import { element, button, renderArticle } from "./editorial-ui.js";
import { createArticleEditor, privateImage } from "./article-editor.js";
import { socialPlatforms } from "./editorial-format.js";
function field(parent, label, value = "", type = "text") {
  const wrapper = element("label", label),
    input = element("input");
  input.type = type;
  if (type === "checkbox") input.checked = Boolean(value);
  else input.value = value;
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
function modal(parent, title, description, choices) {
  const dialog = element("dialog"),
    heading = element("h2", title),
    copy = element("p", description),
    actions = element("div", undefined, "editorial-actions");
  heading.id = "editorial-dialog-" + crypto.randomUUID();
  dialog.setAttribute("aria-labelledby", heading.id);
  dialog.append(heading, copy, actions);
  parent.append(dialog);
  return new Promise((resolve) => {
    let answer = null;
    for (const [label, value] of choices)
      button(actions, label, () => {
        answer = value;
        dialog.close();
      });
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        resolve(answer);
      },
      { once: true },
    );
    dialog.showModal();
    const safeChoice = choices.findIndex(
      ([, value]) => value === null || value === false,
    );
    if (safeChoice >= 0) actions.querySelectorAll("button")[safeChoice].focus();
  });
}
export function mountEditorialAdmin(root, api) {
  let current = null,
    editor = null,
    dirty = false,
    busy = false,
    offset = null,
    articles = [],
    loadGeneration = 0;
  root.replaceChildren(
    element("h2", "Artist Blog"),
    element(
      "p",
      "Private, one-way writing and photography. No comments, reactions, sharing or music integrations.",
      "help",
    ),
  );
  const message = element("p");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const actions = element("div", undefined, "editorial-actions"),
    index = element("div", undefined, "admin-article-index"),
    workspace = element("div", undefined, "admin-article-workspace");
  root.append(actions, message, index, workspace);
  const request = (path, data, file) =>
    api(
      path,
      file
        ? { file }
        : data === undefined
          ? {}
          : { body: JSON.stringify(data), method: "POST" },
    );
  function status(value = "") {
    message.textContent = value;
  }
  async function run(action) {
    if (busy) return;
    const returnFocus = document.activeElement;
    busy = true;
    workspace.setAttribute("aria-busy", "true");
    workspace.inert = true;
    const buttons = [...root.querySelectorAll("button,input")];
    for (const b of buttons) b.disabled = true;
    try {
      await action();
    } catch (error) {
      status(error.message);
    } finally {
      busy = false;
      workspace.removeAttribute("aria-busy");
      workspace.inert = false;
      for (const b of buttons) if (b.isConnected) b.disabled = false;
      if (document.activeElement === document.body && returnFocus?.isConnected)
        returnFocus.focus();
    }
  }
  async function confirmLeave() {
    return (
      !dirty ||
      (await modal(
        root,
        "Discard unsaved article changes?",
        "Your saved article will remain unchanged.",
        [
          ["Keep editing", false],
          ["Discard changes", true],
        ],
      ))
    );
  }
  function changed() {
    dirty = true;
    status("Unsaved changes");
  }
  async function loadIndex(more = false) {
    const generation = ++loadGeneration;
    const result = await request(
      "/api/admin/articles" + (more ? `?offset=${offset}` : ""),
    );
    if (generation !== loadGeneration) return;
    articles = more ? [...articles, ...result.articles] : result.articles;
    offset = result.nextOffset;
    index.replaceChildren();
    const list = element("div", undefined, "admin-article-list");
    for (const row of articles) {
      button(
        list,
        `${row.title} · ${row.status === "published" ? "Published" : "Draft"}${row.prominence === "top" ? " · ★ Top Pin" : row.prominence === "pin" ? " · Pin" : ""}`,
        () =>
          run(async () => {
            if (await confirmLeave()) await open(row.id);
          }),
      );
    }
    if (!articles.length)
      list.append(element("p", "No articles yet. Create a draft to begin."));
    index.append(list);
    if (offset !== null)
      button(index, "Load more saved articles", () =>
        run(() => loadIndex(true)),
      );
  }
  button(actions, "Create article", () =>
    run(async () => {
      if (!(await confirmLeave())) return;
      current = null;
      dirty = false;
      renderEditor({
        id: null,
        title: "",
        body: [],
        images: [],
        status: "draft",
        prominence: "normal",
      });
    }),
  );
  button(actions, "Refresh saved articles", () => run(() => loadIndex()));
  async function open(id) {
    const data = await request("/api/admin/articles/" + id);
    current = data.article;
    dirty = false;
    renderEditor(current);
  }
  let title;
  async function save() {
    const payload = {
      title: title.value,
      body: editor.value(),
      ...(current ? { revision: current.revision } : {}),
    };
    const result = await request(
      "/api/admin/articles" + (current ? "/" + current.id : ""),
      payload,
    );
    current = result.article;
    dirty = false;
    status(
      current.status === "draft" ? "Draft saved." : "Article content saved.",
    );
    await loadIndex();
    renderEditor(current);
    return current;
  }
  async function action(name, data = {}) {
    if (dirty || !current) await save();
    const result = await request(`/api/admin/articles/${current.id}/${name}`, {
      revision: current.revision,
      ...data,
    });
    current = result.article;
    dirty = false;
    await loadIndex();
    renderEditor(current);
  }
  async function assign(value) {
    if (dirty)
      throw new Error("Save article changes before changing prominence.");
    try {
      await action("prominence", { prominence: value });
      status(
        value === "normal"
          ? "Pin removed."
          : value === "top"
            ? "Top Pin assigned."
            : "Standard Pin assigned.",
      );
    } catch (error) {
      if (error.status !== 409 || !error.payload?.topPin) throw error;
      const top = error.payload.topPin;
      const choice = await modal(
        root,
        "Top Pin already assigned",
        `“${top.title}” is currently the Top Pin. Choose how to pin “${current.title}”.`,
        [
          ["Replace Top Pin", "replace"],
          ["Standard Pin Instead", "pin"],
          ["Cancel, I Changed My Mind", null],
        ],
      );
      if (!choice) {
        status("Pin assignment cancelled. Neither article changed.");
        return;
      }
      await action("prominence", {
        prominence: "top",
        resolution: choice,
        expectedTopId: top.id,
        expectedTopRevision: top.revision,
      });
      status(
        choice === "replace"
          ? "Top Pin replaced. The previous article remains a standard Pin."
          : "Standard Pin assigned. Existing Top Pin unchanged.",
      );
    }
  }
  function renderEditor(article) {
    workspace.replaceChildren();
    workspace.append(
      element("h3", article.id ? "Edit article" : "New article"),
    );
    title = field(workspace, "Article title", article.title);
    title.maxLength = 200;
    title.required = true;
    title.addEventListener("input", changed);
    editor = createArticleEditor(workspace, article.body, changed);
    workspace.append(
      element(
        "p",
        "Use the formatting toolbar for headings, emphasis, lists and HTTPS links. Pasted text is plain text. Images appear in the supporting gallery.",
        "help",
      ),
    );
    const controls = element("div", undefined, "editorial-actions");
    workspace.append(controls);
    button(
      controls,
      article.status === "draft" ? "Save draft" : "Save article",
      () => run(save),
    );
    button(controls, "Preview article", () =>
      run(async () => {
        if (dirty || !current) await save();
        const data = await request("/api/admin/articles/" + current.id);
        const dialog = element("dialog", undefined, "article-preview");
        dialog.setAttribute("aria-label", "Private article preview");
        const content = element("article", undefined, "article-reader");
        renderArticle(content, data.article, { preview: true });
        button(dialog, "Close preview", () => dialog.close());
        dialog.append(content);
        root.append(dialog);
        dialog.addEventListener("close", () => dialog.remove(), { once: true });
        dialog.showModal();
      }),
    );
    button(
      controls,
      article.status === "published"
        ? "Unpublish article"
        : article.published_at
          ? "Republish article"
          : "Publish article",
      () =>
        run(async () => {
          await action(
            article.status === "published" ? "unpublish" : "publish",
          );
          status(
            current.status === "published"
              ? "Article published."
              : "Article unpublished. Any Top Pin became a standard Pin.",
          );
        }),
    );
    if (article.id) {
      const pins = element("div", undefined, "editorial-actions");
      workspace.append(
        element(
          "p",
          `Status: ${article.status} · Prominence: ${article.prominence === "top" ? "★ Top Pin" : article.prominence === "pin" ? "Pin" : "Normal"}`,
        ),
        pins,
      );
      button(pins, "Standard Pin", () => run(() => assign("pin")));
      button(pins, "Top Pin", () => run(() => assign("top")));
      button(pins, "Remove pin", () => run(() => assign("normal")));
      button(pins, "Reload saved article", () =>
        run(async () => {
          if (await confirmLeave()) await open(article.id);
        }),
      );
      button(
        pins,
        "Delete article",
        () =>
          run(async () => {
            if (
              await modal(
                root,
                "Delete article?",
                `Permanently delete “${article.title}” and its private images?`,
                [
                  ["Cancel", false],
                  ["Delete article permanently", true],
                ],
              )
            ) {
              await request(`/api/admin/articles/${current.id}/delete`, {
                revision: current.revision,
              });
              current = null;
              dirty = false;
              workspace.replaceChildren();
              await loadIndex();
              status("Article deleted.");
            }
          }),
        "danger",
      );
      renderImages(article);
    }
  }
  function renderImages(article) {
    const group = element("fieldset");
    group.append(element("legend", "Supporting images"));
    workspace.append(group);
    group.append(
      element(
        "p",
        "Choose PNG or JPEG photographs up to 20 MiB. This browser removes metadata and resizes them to validated PNGs up to 2048×2048 and 2 MiB. Up to 12 images per article.",
        "help",
      ),
    );
    const file = field(group, "Choose article image", "", "file");
    file.accept = "image/png,image/jpeg";
    button(group, "Upload article image", () =>
      run(async () => {
        if (!file.files[0]) throw new Error("Choose an image first");
        const converted = await privateImage(file.files[0]);
        if (dirty) await save();
        const result = await request(
          `/api/admin/articles/${current.id}/images?revision=${current.revision}`,
          undefined,
          converted,
        );
        current = result.article;
        renderEditor(current);
        await loadIndex();
        status("Private image uploaded. Add a description or caption.");
      }),
    );
    for (const image of article.images) {
      const card = element("div", undefined, "article-image-editor"),
        preview = element("img");
      preview.src = `/api/blog/images/${image.id}`;
      preview.alt = image.alt || "Article image preview";
      preview.loading = "lazy";
      card.append(preview);
      group.append(card);
      const alt = field(
          card,
          "Image description (empty means decorative)",
          image.alt,
        ),
        caption = field(card, "Image caption", image.caption),
        position = field(card, "Image position", image.position, "number");
      alt.maxLength = 300;
      caption.maxLength = 500;
      position.min = 0;
      position.max = 1000;
      button(card, "Save image details", () =>
        run(async () => {
          if (dirty) await save();
          const result = await request(
            `/api/admin/articles/${current.id}/images/${image.id}`,
            {
              revision: current.revision,
              alt: alt.value,
              caption: caption.value,
              position: Number(position.value),
            },
          );
          current = result.article;
          renderEditor(current);
          await loadIndex();
          status("Image details saved.");
        }),
      );
      button(card, "Remove article image", () =>
        run(async () => {
          if (
            await modal(
              root,
              "Remove image?",
              "Remove this image from the article?",
              [
                ["Cancel", false],
                ["Remove image", true],
              ],
            )
          ) {
            if (dirty) await save();
            const result = await request(
              `/api/admin/articles/${current.id}/images/${image.id}/delete`,
              { revision: current.revision },
            );
            current = result.article;
            renderEditor(current);
            await loadIndex();
            status("Image removed.");
          }
        }),
      );
    }
  }
  window.addEventListener("beforeunload", (event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  loadIndex().catch((error) => status(error.message));
}
export function mountSocialAdmin(root, api) {
  let busy = false;
  const request = (path, data) =>
    api(
      path,
      data === undefined ? {} : { method: "POST", body: JSON.stringify(data) },
    );
  const message = element("p");
  message.setAttribute("role", "status");
  root.replaceChildren(
    element("h2", "Social profiles"),
    element(
      "p",
      "External HTTPS social profiles only. No feeds, account synchronization or sharing widgets.",
      "help",
    ),
    message,
  );
  const content = element("div");
  root.append(content);
  async function run(action) {
    if (busy) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    const controls = [...root.querySelectorAll("button,input,select")];
    for (const c of controls) c.disabled = true;
    try {
      await action();
      message.textContent = "Social profiles saved.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
      for (const c of controls) if (c.isConnected) c.disabled = false;
    }
  }
  function edit(
    parent,
    link = {
      label: "",
      url: "",
      platform: "generic",
      position: 0,
      enabled: false,
    },
  ) {
    const form = element("form");
    parent.append(form);
    const label = field(form, "Social label", link.label),
      url = field(form, "Social HTTPS URL", link.url, "url"),
      platform = element("select");
    label.required = url.required = true;
    label.maxLength = 80;
    url.maxLength = 2048;
    const wrapper = element("label", "Platform icon");
    wrapper.append(platform);
    form.append(wrapper);
    for (const name of socialPlatforms) {
      const option = element(
        "option",
        name === "generic" ? "Other / generic" : name,
      );
      option.value = name;
      platform.append(option);
    }
    platform.setAttribute("aria-label", "Platform icon");
    platform.value = link.platform;
    const position = field(form, "Social position", link.position, "number"),
      enabled = field(form, "Show social link", link.enabled, "checkbox");
    position.min = 0;
    position.max = 1000000;
    const save = element(
      "button",
      link.id ? "Save social link" : "Add social link",
    );
    save.type = "submit";
    form.append(save);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      run(async () => {
        await request("/api/admin/social" + (link.id ? "/" + link.id : ""), {
          label: label.value,
          url: url.value,
          platform: platform.value,
          position: Number(position.value),
          enabled: enabled.checked,
          ...(link.id ? { revision: link.revision } : {}),
        });
        await refresh();
      });
    });
    if (link.id)
      button(form, "Delete social link", () =>
        run(async () => {
          if (
            await modal(
              root,
              "Delete social link?",
              `Remove “${link.label}” from the directory?`,
              [
                ["Cancel", false],
                ["Delete link", true],
              ],
            )
          ) {
            await request("/api/admin/social/" + link.id + "/delete", {
              revision: link.revision,
            });
            await refresh();
          }
        }),
      );
  }
  async function refresh() {
    const data = await request("/api/admin/social");
    content.replaceChildren();
    const create = element("details");
    create.append(element("summary", "Add social profile"));
    content.append(create);
    edit(create);
    for (const link of data.links) {
      const card = element("details");
      card.append(
        element(
          "summary",
          `${link.position}. ${link.label} · ${link.enabled ? "Enabled" : "Disabled"}`,
        ),
      );
      content.append(card);
      edit(card, link);
    }
  }
  button(root, "Refresh social profiles", () => run(refresh));
  refresh().catch((error) => (message.textContent = error.message));
}
