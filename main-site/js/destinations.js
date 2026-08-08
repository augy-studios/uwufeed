// Quiet hours and digest, per destination.
//
// The columns exist on uwufeed_targets so the dispatcher can honour them.
// This is the only place a person can set them, which is the difference
// between a feature and two unread columns.

import { api, describe } from "./api.js";
import { escapeHtml, banner } from "./ui.js";

export async function load(listEl, statusEl) {
  let targets;
  try {
    ({ targets } = await api.listTargets());
  } catch (err) {
    if (err.status !== 401) banner(statusEl, "error", describe(err));
    return;
  }

  if (!targets.length) {
    listEl.innerHTML =
      '<p class="route-hint">Nowhere to deliver yet. Enable notifications, add an ntfy ' +
      "topic, or connect a chat.</p>";
    return;
  }

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  listEl.innerHTML = targets.map((t) => card(t, zone)).join("");
}

function card(target, browserZone) {
  const quiet = target.quiet_from && target.quiet_to;
  const summary = quiet
    ? `Quiet ${target.quiet_from} to ${target.quiet_to} (${target.timezone})`
    : "Always on";

  return `
    <details class="destination" data-target="${target.id}">
      <summary>${escapeHtml(target.label)} <i>${escapeHtml(target.hint)}</i> ${escapeHtml(summary)}</summary>
      <p class="route-hint">Anything arriving inside the quiet window is held, not dropped.
        A live stream alert held past the window is discarded instead, because announcing a
        stream that already ended is worse than saying nothing.</p>
      <div class="field">
        <input type="time" data-field="quiet_from" value="${target.quiet_from || ""}"
               aria-label="Quiet from">
        <input type="time" data-field="quiet_to" value="${target.quiet_to || ""}"
               aria-label="Quiet until">
      </div>
      <label class="route">
        <input type="checkbox" data-field="digest" ${target.digest ? "checked" : ""}>
        <span>One message for everything held, rather than one each</span>
      </label>
      <p class="route-hint">Times are in
        <code>${escapeHtml(target.timezone)}</code>${
          target.timezone !== browserZone
            ? `, and this browser is in <code>${escapeHtml(browserZone)}</code>`
            : ""
        }.</p>
      <div class="btn-row">
        <button class="btn secondary" type="button" data-save="${target.id}">Save</button>
        <button class="btn secondary" type="button" data-clear="${target.id}">Always on</button>
      </div>
    </details>`;
}

export function wire(listEl, statusEl, onChange) {
  listEl.addEventListener("click", async (e) => {
    const save = e.target.closest("[data-save]");
    const clear = e.target.closest("[data-clear]");
    if (!save && !clear) return;

    const box = (save || clear).closest(".destination");
    const targetId = Number(box.dataset.target);
    const field = (name) => box.querySelector(`[data-field="${name}"]`);

    const prefs = clear
      ? { target_id: targetId, quiet_from: null, quiet_to: null, digest: false }
      : {
          target_id: targetId,
          quiet_from: field("quiet_from").value || null,
          quiet_to: field("quiet_to").value || null,
          digest: field("digest").checked,
          // The browser knows its own zone, and quiet hours are meaningless
          // without one.
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        };

    try {
      const result = await api.setTargetPreferences(prefs);
      banner(
        statusEl,
        "ok",
        result.quiet_from
          ? `Quiet ${result.quiet_from} to ${result.quiet_to}.` +
            (result.digest && !result.digest_effective
              ? " A digest needs a quiet window to batch anything."
              : "")
          : "That destination is always on."
      );
      await onChange();
    } catch (err) {
      banner(statusEl, "error", describe(err));
    }
  });
}
