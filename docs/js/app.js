import {
  COLOR_THEMES,
  applyColorTheme,
  applyMode,
  getStoredColorTheme,
  getStoredMode,
  initTheme,
} from "./theme.js";
import { hydrateIcons, openModal, closeModal, escapeHtml } from "./ui.js";
import { SECTIONS, PAGES, DEFAULT_PAGE, findPage, neighbours } from "./nav.js";
import { render } from "./markdown.js";
import * as search from "./search.js";

const cache = new Map();

function buildSidebar() {
  const nav = document.getElementById("sidebarNav");
  nav.innerHTML = SECTIONS.map(
    (section) => `
    <div class="nav-section">
      <p class="nav-section-title">${escapeHtml(section.title)}</p>
      ${section.pages
        .map(
          (page) =>
            `<a class="nav-link" data-page="${page.id}" href="#/${page.id}">${escapeHtml(
              page.title
            )}</a>`
        )
        .join("")}
    </div>`
  ).join("");
}

function markActive(id) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === id);
  });
}

async function fetchPage(page) {
  if (cache.has(page.id)) return cache.get(page.id);
  const res = await fetch(page.file);
  if (!res.ok) throw new Error(`http_${res.status}`);
  const text = await res.text();
  cache.set(page.id, text);
  return text;
}

function buildToc(headings) {
  const toc = document.getElementById("toc");
  if (!headings.length) {
    toc.innerHTML = "";
    toc.classList.add("empty");
    return;
  }
  toc.classList.remove("empty");
  toc.innerHTML =
    `<p class="toc-title">On this page</p>` +
    headings
      .map(
        (heading) =>
          `<a class="toc-link level-${heading.level}" href="#${heading.id}">${escapeHtml(
            heading.text
          )}</a>`
      )
      .join("");
}

function buildPager(id) {
  const { previous, next } = neighbours(id);
  const pager = document.getElementById("pager");
  pager.innerHTML = [
    previous
      ? `<a class="pager-link previous" href="#/${previous.id}">
           <span data-icon="arrowLeft"></span>
           <span class="pager-body"><span class="pager-label">Previous</span>
           <span class="pager-title">${escapeHtml(previous.title)}</span></span></a>`
      : "<span></span>",
    next
      ? `<a class="pager-link next" href="#/${next.id}">
           <span class="pager-body"><span class="pager-label">Next</span>
           <span class="pager-title">${escapeHtml(next.title)}</span></span>
           <span data-icon="arrowRight"></span></a>`
      : "<span></span>",
  ].join("");
  hydrateIcons(pager);
}

async function showPage(id) {
  const page = findPage(id) || findPage(DEFAULT_PAGE);
  const article = document.getElementById("article");
  const breadcrumb = document.getElementById("breadcrumb");

  markActive(page.id);
  breadcrumb.textContent = `${page.section} / ${page.title}`;
  document.title = `${page.title} | uwuFeed docs`;

  try {
    const markdown = await fetchPage(page);
    const { html, headings } = render(markdown);
    article.innerHTML = html;
    buildToc(headings);
  } catch {
    article.innerHTML =
      `<h1>Page unavailable</h1><p>That page could not be loaded. ` +
      `If you are offline, only pages you have already opened are available.</p>`;
    buildToc([]);
  }

  buildPager(page.id);
  hydrateIcons(article);
  closeSidebar();

  // A hash inside the page, for example #/faq then an anchor click, is
  // handled by the browser. A page change always starts at the top.
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function currentPageId() {
  const hash = window.location.hash;
  if (hash.startsWith("#/")) return hash.slice(2).split("#")[0] || DEFAULT_PAGE;
  return DEFAULT_PAGE;
}

function wireRouter() {
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash;
    // An in page anchor is the browser's job, not the router's.
    if (hash && !hash.startsWith("#/")) return;
    showPage(currentPageId());
  });
}

// ---- search ----

function wireSearch() {
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");

  const run = async () => {
    const query = input.value.trim();
    if (query.length < 2) {
      results.classList.add("hidden");
      results.innerHTML = "";
      return;
    }
    await search.ready();
    results.innerHTML = search.renderResults(search.search(query), query);
    results.classList.remove("hidden");
  };

  input.addEventListener("focus", () => search.ready());
  input.addEventListener("input", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      results.classList.add("hidden");
      input.blur();
    }
  });

  results.addEventListener("click", (e) => {
    if (e.target.closest(".search-hit")) {
      results.classList.add("hidden");
      input.value = "";
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) results.classList.add("hidden");
  });

  // Slash focuses search, the one keyboard shortcut worth having.
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
}

// ---- sidebar on small screens ----

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarScrim").classList.remove("hidden");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarScrim").classList.add("hidden");
}

function wireSidebar() {
  document.getElementById("menuBtn").addEventListener("click", openSidebar);
  document.getElementById("sidebarScrim").addEventListener("click", closeSidebar);
}

// ---- theme ----

function buildThemeModal() {
  const grid = document.getElementById("swatchGrid");
  grid.innerHTML = COLOR_THEMES.map(
    (t) => `
      <button class="swatch" data-theme-id="${t.id}" style="--swatch-color:${t.hex}" type="button" aria-label="${t.label}">
        <span class="swatch-dot"></span>
        <span class="swatch-label">${t.label}</span>
      </button>`
  ).join("");

  syncThemeModalState();

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-id]");
    if (!btn) return;
    applyColorTheme(btn.dataset.themeId);
    syncThemeModalState();
  });

  document.getElementById("modeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    applyMode(btn.dataset.mode);
    syncThemeModalState();
  });
}

function syncThemeModalState() {
  const activeTheme = getStoredColorTheme();
  const activeMode = getStoredMode();
  document.querySelectorAll("#swatchGrid .swatch").forEach((el) => {
    el.classList.toggle("active", el.dataset.themeId === activeTheme);
  });
  document.querySelectorAll("#modeToggle .mode-btn").forEach((el) => {
    el.classList.toggle("active", el.dataset.mode === activeMode);
  });
  updateThemeButtonIcon();
}

function updateThemeButtonIcon() {
  const span = document.querySelector("#themeBtn [data-icon]");
  span.setAttribute("data-icon", getStoredMode() === "dark" ? "moon" : "sun");
  hydrateIcons(document.getElementById("themeBtn"));
}

function wireModals() {
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });
  document.getElementById("themeBtn").addEventListener("click", () => openModal("themeModal"));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
}

function boot() {
  initTheme();
  hydrateIcons();
  updateThemeButtonIcon();
  buildThemeModal();
  wireModals();
  buildSidebar();
  wireSidebar();
  wireSearch();
  wireRouter();
  registerServiceWorker();
  showPage(currentPageId());
  console.log(`${PAGES.length} pages loaded`);
}

boot();
