// The timeline. Renders the item shape from db/schema.md.

import { api, isNotImplemented } from "./api.js";
import { hydrateIcons, escapeHtml, relativeTime, banner } from "./ui.js";

const KIND_ICON = { video: "video", article: "article", post: "rss", stream: "bolt" };

export function renderItems(container, items) {
  if (!items.length) {
    container.innerHTML = `
      <div class="empty">
        <span data-icon="inbox"></span>
        <p>Nothing here yet. Add a source and new posts show up within seconds.</p>
      </div>`;
    hydrateIcons(container);
    return;
  }

  container.innerHTML = items.map(itemCard).join("");
  hydrateIcons(container);
}

function itemCard(item) {
  const thumb = item.thumbnail_url
    ? `<img class="item-thumb" src="${escapeHtml(item.thumbnail_url)}" alt="" loading="lazy">`
    : "";
  const meta = [item.author, relativeTime(item.published_at)].filter(Boolean).join(" and ");

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

export async function loadFeed(container, bannerEl) {
  try {
    const data = await api.listItems();
    renderItems(container, (data && data.items) || []);
    banner(bannerEl, "ok", null);
  } catch (err) {
    if (isNotImplemented(err)) {
      renderItems(container, []);
      banner(bannerEl, "busy", "The timeline arrives in Phase 4. Delivery to Discord already works.");
      return;
    }
    banner(bannerEl, "error", "Could not load the timeline.");
  }
}

// TODO Phase 4: keyset pagination, and caching the last 50 items so the
// service worker can serve them offline.
