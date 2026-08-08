// The sources panel: following, unfollowing, and choosing where each one
// goes.

import { api, describe } from "./api.js";
import { hydrateIcons, escapeHtml, banner, confirmDialog } from "./ui.js";

let cache = { sources: [], targets: [] };

export function known() {
  return cache.sources;
}

export async function load(listEl, statusEl) {
  try {
    const [subs, targets] = await Promise.all([api.listSources(), api.listTargets()]);
    cache = { sources: subs.sources, targets: targets.targets };
    render(listEl, subs);
    return cache;
  } catch (err) {
    if (err.status === 401) {
      listEl.innerHTML = "";
      return cache;
    }
    banner(statusEl, "error", describe(err));
    return cache;
  }
}

function render(listEl, data) {
  if (!data.sources.length) {
    listEl.innerHTML = `
      <div class="empty">
        <span data-icon="inbox"></span>
        <p>Nothing followed yet. Paste a link above to start.</p>
      </div>`;
    hydrateIcons(listEl);
    return;
  }

  listEl.innerHTML =
    `<p class="count">${data.count} of ${data.limit} sources</p>` +
    data.sources.map(card).join("");
  hydrateIcons(listEl);
}

// Where a source was added from. A null reads as untracked rather than as
// the web, because a row that predates provenance genuinely does not say,
// and guessing would make the interface confidently wrong.
const ORIGINS = { web: "added on the web", telegram: "added on Telegram", discord: "added on Discord" };

function origin(source) {
  if (!source.added_via) return "";
  const label = source.origin_label || ORIGINS[source.added_via] || source.added_via;
  return `<span class="chip-origin">${escapeHtml(label)}</span>`;
}

function card(source) {
  const speed =
    source.tier === "push"
      ? '<span class="badge"><span data-icon="bolt"></span>seconds</span>'
      : '<span class="badge"><span data-icon="clock"></span>hourly</span>';
  const retired = source.retired_at
    ? '<span class="badge warnish"><span data-icon="alert"></span>retired</span>'
    : "";

  return `
    <div class="source" data-source="${source.id}">
      <div class="source-head">
        <span class="source-title">${escapeHtml(source.title || source.feed_url)}</span>
        <button class="icon-btn small" type="button" data-remove="${source.id}"
                aria-label="Stop following ${escapeHtml(source.title || source.feed_url)}">
          <span data-icon="trash"></span>
        </button>
      </div>
      <div class="source-meta">${speed}${retired}${origin(source)}</div>
      ${routing(source)}
    </div>`;
}

// An empty routing list means everywhere, which is the default. The copy
// has to say that, because "no destinations chosen" and "all destinations"
// are the same stored state and look identical otherwise.
function routing(source) {
  if (!cache.targets.length) return "";

  const chosen = new Set(source.target_ids);
  const options = cache.targets
    .map(
      (t) => `
      <label class="route">
        <input type="checkbox" data-route="${source.id}" value="${t.id}"
               ${chosen.has(t.id) ? "checked" : ""}>
        <span>${escapeHtml(t.label)} <i>${escapeHtml(t.hint)}</i></span>
      </label>`
    )
    .join("");

  const summary = source.routes_everywhere
    ? "Goes everywhere"
    : `Goes to ${source.target_ids.length} of ${cache.targets.length}`;

  return `
    <details class="routing">
      <summary>${summary}</summary>
      <p class="route-hint">Tick none to send it everywhere.</p>
      ${options}
    </details>`;
}

export function wire(listEl, statusEl, onChange) {
  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;

    const title = btn.closest(".source").querySelector(".source-title").textContent;
    const sure = await confirmDialog({
      title: "Stop following?",
      body: `${title} will stop arriving. The feed itself is untouched, and you can follow it again later.`,
      confirmLabel: "Stop following",
      cancelLabel: "Keep it",
    });
    if (!sure) return;

    btn.disabled = true;
    try {
      await api.removeSource(Number(btn.dataset.remove));
      banner(statusEl, "ok", "Stopped following it.");
      await onChange();
    } catch (err) {
      banner(statusEl, "error", describe(err));
      btn.disabled = false;
    }
  });

  listEl.addEventListener("change", async (e) => {
    const box = e.target.closest("[data-route]");
    if (!box) return;
    const sourceId = Number(box.dataset.route);
    const chosen = [...listEl.querySelectorAll(`[data-route="${sourceId}"]:checked`)].map((el) =>
      Number(el.value)
    );
    try {
      const result = await api.routeSource(sourceId, chosen);
      banner(
        statusEl,
        "ok",
        result.routes_everywhere
          ? "That one now goes everywhere."
          : `That one now goes to ${result.target_ids.length} destination(s).`
      );
      await onChange();
    } catch (err) {
      banner(statusEl, "error", describe(err));
    }
  });
}
