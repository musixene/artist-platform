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
import { diagnostics } from "./diagnostics.js";
export function mountDiagnostics(root) {
  root.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = "Diagnostics";
  root.append(title);
  const availability = document.createElement("p"),
    stats = document.createElement("p"),
    message = document.createElement("p");
  message.setAttribute("role", "status");
  root.append(availability, stats, message);
  const controls = document.createElement("div");
  controls.className = "diagnostic-controls";
  root.append(controls);
  const buttons = {};
  let busy = false,
    lastError = "";
  const run = async (task) => {
    if (busy) return;
    busy = true;
    lastError = "";
    render();
    try {
      await task();
      await history();
    } catch (error) {
      lastError = error.message;
      message.textContent = error.message;
    } finally {
      busy = false;
      render();
    }
  };
  const button = (parent, label, action) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = () => run(action);
    parent.append(b);
    return b;
  };
  buttons.start = button(controls, "Start Debug", () => diagnostics.start());
  buttons.stop = button(controls, "Stop Debug", () => diagnostics.stop());
  buttons.retry = button(controls, "Retry Upload", () => diagnostics.stop());
  buttons.export = button(controls, "Export Local Report", () =>
    diagnostics.exportLocal(),
  );
  buttons.discard = button(controls, "Discard Report", () => {
    if (confirm("Permanently discard the unsaved local diagnostic report?"))
      return diagnostics.discard();
  });
  const form = document.createElement("form"),
    enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.id = "diagnostics-enabled";
  const label = document.createElement("label");
  label.htmlFor = enabled.id;
  label.textContent = "Instance Diagnostics Enabled";
  label.prepend(enabled);
  form.append(label);
  const retention = document.createElement("input");
  retention.type = "number";
  retention.min = "1";
  retention.max = "30";
  retention.id = "diagnostics-retention";
  const days = document.createElement("label");
  days.htmlFor = retention.id;
  days.textContent = "Report retention (days, 1–30)";
  days.append(retention);
  form.append(days);
  const save = document.createElement("button");
  save.textContent = "Save Diagnostic Settings";
  form.append(save);
  root.append(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    const value = {
      enabled: enabled.checked,
      retentionDays: Number(retention.value),
    };
    run(async () => {
      await diagnostics.request("settings", value);
      await diagnostics.revalidate();
    });
  };
  const h = document.createElement("h3");
  h.textContent = "Your diagnostic history";
  root.append(h);
  const help = document.createElement("p");
  help.textContent =
    "Only your reports appear here. Recordings stay on this device until Stop Debug or logout. Exported files are your responsibility. No reports are sent to Musixene.";
  root.append(help);
  button(root, "Refresh Diagnostic Status", async () => {
    await diagnostics.revalidate();
  });
  const list = document.createElement("div"),
    view = document.createElement("pre");
  view.tabIndex = 0;
  view.className = "diagnostic-report";
  view.setAttribute("aria-label", "Diagnostic report JSON");
  root.append(list, view);
  let offset = 0;
  button(root, "Previous Reports", async () => {
    offset = Math.max(0, offset - 20);
  });
  button(root, "More Reports", async () => {
    offset += 20;
  });
  function render() {
    const ctx = diagnostics.context,
      s = diagnostics.state;
    availability.textContent = `Server Diagnostics Allowed: ${ctx?.allowed ? "Yes" : "No"} · Instance Diagnostics Enabled: ${ctx?.enabled ? "On" : "Off"} · Current Recording Status: ${s ? { recording: "Recording", finalizing: "Finalizing", upload_failed: "Upload Failed" }[s.status] : "Inactive"}`;
    stats.textContent = s
      ? `Started ${new Date(s.startedAt).toLocaleString()} · ${Math.round((s.elapsedMs || 0) / 1000)} seconds observed · ${s.events.length} events · approximately ${s.bytes} bytes · ${s.droppedEvents} older events dropped`
      : "";
    if (!busy) message.textContent = lastError || diagnostics.message;
    buttons.start.disabled = busy || !!s || !ctx?.allowed || !ctx.enabled;
    buttons.stop.disabled = busy || s?.status !== "recording";
    buttons.retry.disabled =
      busy ||
      s?.status !== "upload_failed" ||
      !ctx?.allowed ||
      !ctx.enabled ||
      s.generation !== ctx.generation;
    buttons.export.disabled = busy || !s;
    buttons.discard.disabled = busy || !s;
    enabled.disabled = busy || !ctx?.allowed;
    save.disabled = busy || !ctx;
    retention.disabled = busy;
    if (document.activeElement !== enabled) enabled.checked = !!ctx?.enabled;
    if (document.activeElement !== retention)
      retention.value = ctx?.retentionDays || 7;
  }
  async function history() {
    const epoch = diagnostics.epoch;
    const result = await diagnostics.request("reports?offset=" + offset);
    if (epoch !== diagnostics.epoch) return;
    list.replaceChildren();
    if (!result.reports.length) {
      const p = document.createElement("p");
      p.textContent = "No saved reports on this page.";
      list.append(p);
    }
    for (const report of result.reports) {
      const article = document.createElement("article"),
        summary = document.createElement("p");
      summary.textContent = `${new Date(report.startedAt).toLocaleString()} · ${Math.round(report.durationMs / 1000)} seconds · ${report.status} · ${report.reason} · ${report.eventCount} events · ${report.sizeBytes} bytes · ${report.categories.join(", ")}`;
      article.append(summary);
      list.append(article);
      const load = () => diagnostics.request("reports/" + report.id);
      button(article, "View Report", async () => {
        const data = await load();
        if (epoch === diagnostics.epoch)
          view.textContent = JSON.stringify(data, null, 2);
      });
      button(article, "Export JSON", async () => {
        const data = await load();
        if (epoch === diagnostics.epoch)
          diagnostics.download(data, `diagnostic-${report.id}.json`);
      });
      if (navigator.clipboard)
        button(article, "Copy Report", async () => {
          const data = await load();
          if (epoch === diagnostics.epoch)
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        });
      button(article, "Delete Report", async () => {
        if (confirm("Permanently delete this saved diagnostic report?"))
          await diagnostics.request("reports/" + report.id + "/delete", {});
        view.textContent = "";
      });
    }
  }
  diagnostics.addEventListener("change", () => {
    if (!diagnostics.context) {
      list.replaceChildren();
      view.textContent = "";
    }
    render();
  });
  render();
  history().catch((e) => {
    message.textContent = e.message;
  });
}
