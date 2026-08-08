import {
  COLOR_THEMES,
  applyColorTheme,
  applyMode,
  getStoredColorTheme,
  getStoredMode,
  initTheme,
} from "./theme.js";
import { hydrateIcons, openModal, closeModal, banner, escapeHtml } from "./ui.js";
import { api, describe } from "./api.js";
import * as auth from "./auth.js";
import * as feed from "./feed.js";
import * as sources from "./sources.js";
import { downloadOpml, parseOpml, readFile } from "./opml.js";
import { pushSupported, currentSubscription, subscribe, unsubscribe } from "./push.js";

const el = (id) => document.getElementById(id);

// ---- signed in chrome ----

function paintAuthState() {
  const signedIn = auth.state.signedIn;
  document.body.classList.toggle("signed-in", signedIn);
  el("authPanel").classList.toggle("hidden", signedIn);
  el("accountPanel").classList.toggle("hidden", !signedIn);
  el("sourceForm").classList.toggle("hidden", !signedIn);
  el("sourcesSignedOut").classList.toggle("hidden", signedIn);
  el("feedSignedOut").classList.toggle("hidden", signedIn);
  el("whoami").textContent = signedIn ? auth.state.username || auth.state.email || "" : "";
}

async function refreshAll() {
  await Promise.all([
    feed.loadFeed(el("itemList"), el("feedBanner"), el("loadMore")),
    sources.load(el("sourceList"), el("sourcesBanner")),
  ]);
}

// ---- auth forms ----

function wireAuth() {
  const form = el("authForm");
  const status = el("authBanner");

  el("authToggle").addEventListener("click", () => {
    const registering = form.dataset.mode !== "register";
    form.dataset.mode = registering ? "register" : "login";
    el("authTitle").textContent = registering ? "Create an account" : "Sign in";
    el("authSubmit").textContent = registering ? "Create account" : "Sign in";
    el("authToggle").textContent = registering
      ? "I already have an account"
      : "I need an account";
    el("authUsername").classList.toggle("hidden", !registering);
    banner(status, "ok", null);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = el("authEmail").value.trim();
    const password = el("authPassword").value;
    const username = el("authUsername").value.trim();
    const registering = form.dataset.mode === "register";

    el("authSubmit").disabled = true;
    try {
      if (registering) await auth.register(email, password, username);
      else await auth.login(email, password);
      banner(status, "ok", null);
      form.reset();
      paintAuthState();
      await refreshAll();
    } catch (err) {
      banner(status, "error", describe(err));
    } finally {
      el("authSubmit").disabled = false;
    }
  });

  el("signOut").addEventListener("click", async () => {
    await auth.logout();
    paintAuthState();
    feed.reset();
    el("itemList").innerHTML = "";
    el("sourceList").innerHTML = "";
  });
}

// ---- sources ----

function wireSources() {
  const status = el("sourcesBanner");

  el("sourceForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = el("sourceUrl");
    const url = input.value.trim();
    if (!url) return;

    el("sourceAdd").disabled = true;
    banner(status, "busy", "Looking that up...");
    try {
      const result = await api.addSource(url);
      const speed =
        result.source.tier === "push"
          ? "New posts arrive within seconds."
          : "This one is checked regularly, so posts arrive within the hour.";
      banner(
        status,
        "ok",
        result.already_following
          ? `Already following ${result.source.title || result.source.feed_url}.`
          : `Following ${result.source.title || result.source.feed_url}. ${speed}`
      );
      input.value = "";
      await refreshAll();
    } catch (err) {
      banner(status, "error", describe(err));
    } finally {
      el("sourceAdd").disabled = false;
    }
  });

  sources.wire(el("sourceList"), status, () =>
    sources.load(el("sourceList"), status)
  );
}

// ---- OPML ----

function wireOpml() {
  const status = el("sourcesBanner");

  el("opmlExport").addEventListener("click", () => {
    const known = sources.known();
    if (!known.length) {
      banner(status, "busy", "Nothing to export yet.");
      return;
    }
    downloadOpml(known);
  });

  const input = el("opmlFile");
  el("opmlImport").addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    input.value = "";

    let feeds;
    try {
      feeds = parseOpml(await readFile(file));
    } catch {
      banner(status, "error", "That file could not be read as OPML.");
      return;
    }
    if (!feeds.length) {
      banner(status, "error", "No feeds found in that file.");
      return;
    }

    // One at a time with a gap. A 200 feed import must not become 200
    // simultaneous outbound requests against 200 unsuspecting servers.
    let added = 0;
    let failed = 0;
    for (const [index, entry] of feeds.entries()) {
      banner(status, "busy", `Importing ${index + 1} of ${feeds.length}...`);
      try {
        await api.addSource(entry.url);
        added += 1;
      } catch (err) {
        failed += 1;
        if (err.message === "source_limit_reached") {
          banner(status, "warn", `Stopped at the 50 source limit. Added ${added}.`);
          await refreshAll();
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    banner(
      status,
      failed ? "warn" : "ok",
      `Imported ${added} of ${feeds.length}.${failed ? ` ${failed} could not be read.` : ""}`
    );
    await refreshAll();
  });
}

// ---- notifications ----

async function paintPushState() {
  const btn = el("pushToggle");
  if (!pushSupported()) {
    btn.disabled = true;
    el("pushHint").textContent = "This browser cannot receive push notifications.";
    return;
  }
  const existing = await currentSubscription();
  btn.disabled = false;
  btn.dataset.on = existing ? "yes" : "no";
  btn.querySelector(".label").textContent = existing
    ? "Turn off notifications"
    : "Enable notifications";
  el("pushHint").textContent = existing
    ? "This browser receives notifications."
    : "Get new posts as system notifications, even with the app closed.";
}

function wirePush() {
  const status = el("accountBanner");

  el("pushToggle").addEventListener("click", async () => {
    const btn = el("pushToggle");
    btn.disabled = true;
    try {
      if (btn.dataset.on === "yes") {
        const existing = await currentSubscription();
        if (existing) await api.removeWebPush(existing.toJSON());
        await unsubscribe();
        banner(status, "ok", "Notifications off for this browser.");
      } else {
        const { public_key: key } = await api.vapidKey();
        if (!key) {
          banner(status, "error", "Notifications are not configured on this instance.");
          return;
        }
        const created = await subscribe(key);
        await api.registerWebPush(created.toJSON());
        banner(status, "ok", "Notifications on for this browser.");
      }
      await paintPushState();
      await refreshAll();
    } catch (err) {
      banner(
        status,
        "error",
        err.message === "permission_denied"
          ? "The browser blocked notifications. Turn them back on in site settings."
          : describe(err)
      );
    } finally {
      el("pushToggle").disabled = false;
    }
  });
}

// ---- linking a chat ----

function wireLink() {
  const status = el("accountBanner");

  el("linkBtn").addEventListener("click", async () => {
    try {
      const data = await api.linkCode();
      const box = el("linkResult");
      box.classList.remove("hidden");
      box.innerHTML = data.telegram_url
        ? `<a class="btn" href="${escapeHtml(data.telegram_url)}" target="_blank"
              rel="noopener noreferrer"><span data-icon="external"></span>Open Telegram</a>
           <p class="route-hint">Or send this to the bot: <code>/link ${escapeHtml(data.token)}</code></p>`
        : `<p class="route-hint">Send this to the bot: <code>/link ${escapeHtml(data.token)}</code></p>`;
      hydrateIcons(box);
      banner(status, "ok", "Code valid for ten minutes.");
    } catch (err) {
      banner(status, "error", describe(err));
    }
  });
}

// ---- theme, tabs, modals ----

function buildThemeModal() {
  const grid = el("swatchGrid");
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

  el("modeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    applyMode(btn.dataset.mode);
    syncThemeModalState();
  });
}

function syncThemeModalState() {
  const activeTheme = getStoredColorTheme();
  const activeMode = getStoredMode();
  document.querySelectorAll("#swatchGrid .swatch").forEach((element) => {
    element.classList.toggle("active", element.dataset.themeId === activeTheme);
  });
  document.querySelectorAll("#modeToggle .mode-btn").forEach((element) => {
    element.classList.toggle("active", element.dataset.mode === activeMode);
  });
  updateThemeButtonIcon();
}

function updateThemeButtonIcon() {
  const span = document.querySelector("#themeBtn [data-icon]");
  span.setAttribute("data-icon", getStoredMode() === "dark" ? "moon" : "sun");
  hydrateIcons(el("themeBtn"));
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
  el("themeBtn").addEventListener("click", () => openModal("themeModal"));
}

function wireTabs() {
  const tabs = el("tabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-panel]");
    if (!btn) return;
    tabs.querySelectorAll(".tab").forEach((element) => {
      const active = element === btn;
      element.classList.toggle("active", active);
      element.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== btn.dataset.panel);
    });
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
}

async function boot() {
  initTheme();
  hydrateIcons();
  updateThemeButtonIcon();
  buildThemeModal();
  wireModals();
  wireTabs();
  wireAuth();
  wireSources();
  wireOpml();
  wirePush();
  wireLink();
  registerServiceWorker();

  // Optimistic, from the stored hint, so the shell does not flicker.
  auth.primeFromHint();
  paintAuthState();

  el("loadMore").addEventListener("click", () =>
    feed.loadFeed(el("itemList"), el("feedBanner"), el("loadMore"), { append: true })
  );

  // The server is the authority. A 401 here corrects an optimistic guess.
  try {
    await api.listItems();
  } catch (err) {
    if (err.status === 401) {
      auth.applySignedOut();
      paintAuthState();
      return;
    }
  }

  await refreshAll();
  await paintPushState();
}

boot();
