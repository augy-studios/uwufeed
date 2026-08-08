// The timeline. Renders the item shape from db/schema.md.

import { api, describe } from "./api.js";
import { hydrateIcons, escapeHtml, relativeTime, banner } from "./ui.js";

const KIND_ICON = { video: "video", article: "article", post: "rss", stream: "bolt" };

let cursor = null;
let loading = false;

export function reset() {
  cursor = null;
}

export function renderItems(container, items, { append = false } = {}) {
  if (!items.length && !append) {
    container.innerHTML = `
      <div class="empty">
        <span data-icon="inbox"></span>
        <p>Nothing here yet. Follow a source and new posts show up within seconds.</p>
      </div>`;
    hydrateIcons(container);
    return;
  }

  const html = items.map(itemCard).join("");
  if (append) container.insertAdjacentHTML("beforeend", html);
  else container.innerHTML = html;
  hydrateIcons(container);
}

function itemCard(item) {
  const thumb = item.thumbnail_url
    ? `<img class="item-thumb" src="${escapeHtml(item.thumbnail_url)}" alt="" loading="lazy">`
    : "";
  const meta = [item.source_title || item.author, relativeTime(item.published_at)]
    .filter(Boolean)
    .join(" and ");

  return `
    <a class="item" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener noreferrer">
      ${thumb}
      <div class="item-body">
        <span class="item-title">${escapeHtml(item.title || "Untitled")}</span>
        <span class="item-meta">
          <span data-icon="${KIND_ICON[item.kind] || "rss"}"></span>
          <span>${escapeHtml(meta)}</span>
        </span>
      </div>
    </a>`;
}

export async function loadFeed(container, bannerEl, moreBtn, { append = false } = {}) {
  if (loading) return;
  loading = true;
  try {
    const data = await api.listItems(append ? cursor : null);
    if (!append) reset();
    renderItems(container, data.items || [], { append });
    cursor = data.cursor || null;
    moreBtn.classList.toggle("hidden", !cursor);
    banner(bannerEl, "ok", null);
  } catch (err) {
    if (err.status === 401) {
      container.innerHTML = "";
      moreBtn.classList.add("hidden");
      return;
    }
    banner(bannerEl, "error", describe(err));
  } finally {
    loading = false;
  }
}
