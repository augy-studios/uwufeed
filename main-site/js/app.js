import {
  COLOR_THEMES,
  applyColorTheme,
  applyMode,
  getStoredColorTheme,
  getStoredMode,
  initTheme,
} from "./theme.js";
import { hydrateIcons, openModal, closeModal, banner } from "./ui.js";
import { loadFeed } from "./feed.js";
import { downloadOpml, parseOpml, readFile } from "./opml.js";

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

function wireTabs() {
  const tabs = document.getElementById("tabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-panel]");
    if (!btn) return;
    tabs.querySelectorAll(".tab").forEach((el) => {
      const active = el === btn;
      el.classList.toggle("active", active);
      el.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== btn.dataset.panel);
    });
  });
}

// /api/sources/resolve needs a bearer token the browser must never hold,
// so adding a source from here waits on real sessions.
function wireSources() {
  const status = document.getElementById("sourcesBanner");
  document.getElementById("sourceAdd").addEventListener("click", () => {
    const url = document.getElementById("sourceUrl").value.trim();
    if (!url) return;
    banner(status, "busy", "Adding sources from the browser arrives with accounts in Phase 4.");
  });
}

// OPML export needs the source list from the API, which is Phase 4. Until
// then the buttons are wired and say so rather than being absent.
function wireOpml() {
  const status = document.getElementById("sourcesBanner");

  document.getElementById("opmlExport").addEventListener("click", () => {
    downloadOpml([]);
    banner(status, "busy", "Exported an empty file. Sources arrive with accounts in Phase 4.");
  });

  const input = document.getElementById("opmlFile");
  document.getElementById("opmlImport").addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const feeds = parseOpml(await readFile(file));
      banner(status, "busy", `Read ${feeds.length} feeds. Importing arrives in Phase 4.`);
    } catch {
      banner(status, "error", "That file could not be read as OPML.");
    }
    input.value = "";
  });
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
  wireTabs();
  wireSources();
  wireOpml();
  registerServiceWorker();
  loadFeed(document.getElementById("itemList"), document.getElementById("feedBanner"));
}

boot();
