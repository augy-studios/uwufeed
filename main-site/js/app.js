import {
  COLOR_THEMES,
  applyColorTheme,
  applyMode,
  getStoredColorTheme,
  getStoredMode,
  initTheme,
} from "./theme.js";
import { hydrateIcons, openModal, closeModal, banner, escapeHtml, confirmDialog } from "./ui.js";
import { api, describe, handleUnauthorized, setScope, currentScope } from "./api.js";
import * as auth from "./auth.js";
import * as feed from "./feed.js";
import * as sources from "./sources.js";
import * as destinations from "./destinations.js";
import { downloadOpml, parseOpml, readFile } from "./opml.js";
import { pushSupported, currentSubscription, subscribe, unsubscribe } from "./push.js";
import {
  assertPasskey,
  deviceCanVerify,
  registerPasskey,
  wasCancelled,
} from "./passkey.js";

const el = (id) => document.getElementById(id);

// ---- signed in chrome ----

// Everything that only makes sense signed in is hidden rather than
// disabled, so there is never a control that looks available and is not.
function paintAuthState() {
  const signedIn = auth.state.signedIn;
  document.body.classList.toggle("signed-in", signedIn);
  el("authPanel").classList.toggle("hidden", signedIn);
  el("accountPanel").classList.toggle("hidden", !signedIn);
  el("sourceForm").classList.toggle("hidden", !signedIn);
  el("sourcesSignedOut").classList.toggle("hidden", signedIn);
  el("feedSignedOut").classList.toggle("hidden", signedIn);
  el("whoami").textContent = signedIn ? auth.state.username || auth.state.email || "" : "";

  if (!signedIn) {
    // A signed out account tab should carry nothing from the last session:
    // no stale link code, no notification state, no leftover message.
    // A scope is somebody else's room. It must not survive a sign out.
    setScope(null);
    spaces = [];
    el("scopeBar").classList.add("hidden");
    el("scopePicker").value = "";
    el("identityList").innerHTML = "";
    el("spaceList").innerHTML = "";
    document.body.classList.remove("scoped");
    el("linkResult").classList.add("hidden");
    el("linkResult").innerHTML = "";
    // A reset result is a password in plain sight. It must not survive a
    // sign out and reappear for whoever opens the tab next.
    el("resetResult").classList.add("hidden");
    el("resetResult").innerHTML = "";
    el("resetPanel").classList.add("hidden");
    el("resetOpenRow").classList.remove("hidden");
    el("authForm").classList.remove("hidden");
    el("passwordForm").reset();
    el("recoveryViewForm").reset();
    // Ten working codes must not sit on screen for whoever opens the tab
    // next.
    el("recoveryCodesResult").classList.add("hidden");
    el("recoveryCodesResult").innerHTML = "";
    banner(el("recoveryViewBanner"), "ok", null);
    banner(el("passwordBanner"), "ok", null);
    banner(el("accountBanner"), "ok", null);
    banner(el("sourcesBanner"), "ok", null);
    el("itemList").innerHTML = "";
    el("sourceList").innerHTML = "";
    el("destinationList").innerHTML = "";
    el("loadMore").classList.add("hidden");
    feed.reset();
  } else {
    // Cosmetic, so they are not awaited and a failure changes nothing.
    refreshRecoveryCount();
    loadIdentities();
    loadScope();
  }
}

async function refreshAll() {
  await Promise.all([
    feed.loadFeed(el("itemList"), el("feedBanner"), el("loadMore")),
    sources.load(el("sourceList"), el("sourcesBanner")),
    destinations.load(el("destinationList"), el("accountBanner")),
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

    // Registration needs a real address, so the browser validates it as one.
    // Signing in takes either, and the server decides which by the @.
    const identifier = el("authEmail");
    identifier.type = registering ? "email" : "text";
    identifier.placeholder = registering ? "Email" : "Email or username";
    identifier.setAttribute("aria-label", identifier.placeholder);
    identifier.autocomplete = registering ? "email" : "username";

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
      const data = registering
        ? await auth.register(email, password, username)
        : await auth.login(email, password);
      banner(status, "ok", null);
      form.reset();
      paintAuthState();
      await refreshAll();
      // Issued at registration, and backfilled on a first sign in for an
      // account that predates them. Either way this is the only showing.
      showFreshCodes(data.recovery_codes);
    } catch (err) {
      banner(status, "error", describe(err));
    } finally {
      el("authSubmit").disabled = false;
    }
  });

  el("signOut").addEventListener("click", async () => {
    // The button is only visible when signed in, but the hint that paints
    // it is optimistic, so check the real state before promising anything.
    if (!auth.state.signedIn) {
      paintAuthState();
      return;
    }

    const sure = await confirmDialog({
      title: "Sign out?",
      body:
        "This browser will stop showing your feed. Anything you follow stays, " +
        "and connected chats keep receiving posts.",
      confirmLabel: "Sign out",
      cancelLabel: "Stay signed in",
    });
    if (!sure) return;

    await auth.logout();
    paintAuthState();
  });
}

// ---- forgotten passwords ----

// Two steps that live in one panel. Requesting shows either a code prompt,
// when a chat took the code, or the new password itself when there was no
// chat to send one to.
function wireReset() {
  const panel = el("resetPanel");
  const openRow = el("resetOpenRow");
  const result = el("resetResult");
  const confirmForm = el("resetConfirmForm");

  function close() {
    // The toggle lives inside the form, so hiding the form hides it too.
    panel.classList.add("hidden");
    openRow.classList.remove("hidden");
    el("authForm").classList.remove("hidden");
    resetPanelState();
  }

  function resetPanelState() {
    el("resetForm").reset();
    confirmForm.reset();
    confirmForm.classList.add("hidden");
    result.classList.add("hidden");
    result.innerHTML = "";
    el("recoveryForm").reset();
    banner(el("resetBanner"), "ok", null);
    banner(el("resetConfirmBanner"), "ok", null);
    banner(el("recoveryBanner"), "ok", null);
  }

  el("resetOpen").addEventListener("click", () => {
    resetPanelState();
    panel.classList.remove("hidden");
    openRow.classList.add("hidden");
    el("authForm").classList.add("hidden");
    el("resetEmail").value = el("authEmail").value.trim();
    el("resetEmail").focus();
  });

  el("resetCancel").addEventListener("click", close);

  el("resetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = el("resetBanner");
    const email = el("resetEmail").value.trim();

    el("resetSubmit").disabled = true;
    banner(status, "busy", "Looking that up...");
    try {
      const data = await api.requestReset(email);

      if (data.reset) {
        // No chat was connected, so the password has already changed and
        // this is the only place it is ever shown.
        banner(status, "ok", null);
        result.classList.remove("hidden");
        result.innerHTML =
          `<p class="route-hint">No chat is connected to that account, so the password ` +
          `has been reset ${data.from_username ? "to your username" : "to a new one"}. ` +
          `It is not shown again.</p>` +
          `<p><code>${escapeHtml(data.password)}</code></p>` +
          `<p class="route-hint">Sign in with it, then change it from the Account tab. ` +
          `Connect a chat while you are there and the next reset arrives privately.</p>`;
      } else {
        // The hint already reads as a place, and every one of them is
        // private to one person, so it stands on its own.
        banner(status, "ok", `A code is on its way to ${data.hint}.`);
        result.classList.add("hidden");
        confirmForm.classList.remove("hidden");
        el("resetToken").focus();
      }
    } catch (err) {
      banner(status, "error", describe(err));
    } finally {
      el("resetSubmit").disabled = false;
    }
  });

  confirmForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = el("resetConfirmBanner");
    const token = el("resetToken").value.trim();
    const password = el("resetNewPassword").value;

    el("resetConfirmSubmit").disabled = true;
    try {
      const data = await api.confirmReset(token, password);
      // The server signs the account in as part of confirming, so there is
      // nothing left to type.
      auth.applyUser(data.user);
      close();
      paintAuthState();
      await refreshAll();
      banner(el("accountBanner"), "ok", "Password set, and every other browser was signed out.");
    } catch (err) {
      banner(status, "error", describe(err));
    } finally {
      el("resetConfirmSubmit").disabled = false;
    }
  });

  // A redeemed recovery code lands on the same confirm step an emailed
  // code does. One screen sets a password, whatever proved the right to.
  wireRecoveryRedeem((token, remaining) => {
    el("resetToken").value = token;
    result.classList.add("hidden");
    confirmForm.classList.remove("hidden");
    el("resetNewPassword").focus();
    banner(
      el("recoveryBanner"),
      "ok",
      remaining === 0
        ? "Code accepted, and that was your last one. Choose a new password."
        : `Code accepted, ${remaining} left. Choose a new password.`
    );
  });
}

// ---- coming back from Discord ----

// The callback puts the outcome in the fragment rather than the query, so
// it never reaches a server log or a referrer. Read it once, then strip it,
// so a refresh does not replay the message.
const DISCORD_OUTCOMES = {
  signed_in: ["ok", "Signed in with Discord."],
  created: ["ok", "Account created with Discord. Your recovery codes are on the Account tab."],
  linked: ["ok", "Discord connected."],
  already_linked: ["ok", "That Discord account is already connected."],
  cancelled: ["ok", null],
  "error:bad_state": ["error", "That sign in did not start here. Try again from this page."],
  "error:discord_belongs_to_another_account": [
    "error",
    "That Discord account is already on a different uwuFeed account.",
  ],
  "error:discord_unavailable": ["error", "Discord could not be reached. Try again."],
  "error:discord_oauth_not_configured": ["error", "Discord sign in is not set up here."],
};

function readDiscordOutcome() {
  const match = /[#&]discord=([^&]+)/.exec(window.location.hash);
  if (!match) return null;

  history.replaceState(null, "", window.location.pathname + window.location.search);
  return decodeURIComponent(match[1]);
}

// ---- scope: you, or a space you manage ----

let spaces = [];

async function loadScope() {
  try {
    const data = await api.listSpaces();
    spaces = data.spaces || [];
  } catch {
    spaces = [];
  }

  const picker = el("scopePicker");
  const current = currentScope();
  picker.innerHTML =
    '<option value="">Your own feed</option>' +
    spaces
      .map(
        (s) =>
          `<option value="${s.id}">${escapeHtml(s.label)} (${
            s.platform === "discord" ? "server" : "group"
          })</option>`
      )
      .join("");
  picker.value = current || "";

  // A picker with one option is noise, so it only appears when there is a
  // choice to make.
  el("scopeBar").classList.toggle("hidden", spaces.length === 0);
  paintScopeNote();
  renderSpaces();
}

function paintScopeNote() {
  const space = spaces.find((s) => String(s.id) === String(currentScope()));
  document.body.classList.toggle("scoped", Boolean(space));

  if (!space) {
    el("scopeNote").textContent = "";
    return;
  }
  const where = space.platform === "discord" ? "Discord" : "Telegram";
  el("scopeNote").textContent =
    `Shared with everyone who manages this, and separate from your own feed. ` +
    `Your access is checked with ${where} each time this list loads.`;
}

function wireScope() {
  el("scopePicker").addEventListener("change", async () => {
    setScope(el("scopePicker").value);
    paintScopeNote();
    banner(el("accountBanner"), "ok", null);
    banner(el("sourcesBanner"), "ok", null);
    feed.reset();
    await refreshAll();
  });
}

function renderSpaces() {
  const box = el("spaceList");
  if (!spaces.length) {
    box.innerHTML =
      '<p class="route-hint">Nothing yet. Run <code>/link</code> in a server or group you ' +
      "manage, and it appears here.</p>";
    return;
  }

  box.innerHTML = spaces
    .map((s) => {
      const kind = s.platform === "discord" ? "Discord server" : "Telegram group or channel";
      // null means the bot could not be asked, which is different from
      // knowing it is absent, and the wording has to keep them apart.
      const missing =
        s.bot_present === false && s.invite_url
          ? `<a class="btn secondary" href="${escapeHtml(s.invite_url)}" target="_blank"
               rel="noopener noreferrer"><span data-icon="plus"></span>Add the bot</a>`
          : "";
      const note =
        s.bot_present === false
          ? '<span class="route-hint">The bot is not in this one yet.</span>'
          : "";

      return `<div class="destination">
        <div><strong>${escapeHtml(s.label)}</strong>
          <span class="route-hint">${kind}, ${s.sources} source${s.sources === 1 ? "" : "s"}</span>
          ${note}</div>
        ${missing}
      </div>`;
    })
    .join("");
  hydrateIcons(box);
}

// ---- linked services ----

async function loadIdentities() {
  const box = el("identityList");
  try {
    const { identities } = await api.listIdentities();
    if (!identities.length) {
      box.innerHTML =
        '<p class="route-hint">Nothing connected. Linking Telegram or Discord gives you a ' +
        "private way back in if you forget your password.</p>";
      return;
    }

    box.innerHTML = identities
      .map(
        (i) => `<div class="destination">
          <div><strong>${escapeHtml(i.label)}</strong>
            <span class="route-hint">${escapeHtml(i.display_name || "connected")}, verified ${
              i.verified_via === "oauth" ? "by signing in" : "with a link code"
            }</span></div>
          <button class="btn secondary" type="button" data-unlink="${i.id}">Unlink</button>
        </div>`
      )
      .join("");
    hydrateIcons(box);
  } catch (err) {
    box.innerHTML = "";
    banner(el("accountBanner"), "error", describe(err));
  }
}

function wireIdentities() {
  el("identityList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-unlink]");
    if (!btn) return;

    const sure = await confirmDialog({
      title: "Unlink this service?",
      body:
        "Password resets stop going there, and any server or group it gave you access to " +
        "disappears from your list. Nothing about those servers changes.",
      confirmLabel: "Unlink",
      cancelLabel: "Keep it",
    });
    if (!sure) return;

    try {
      await api.unlinkIdentity(Number(btn.dataset.unlink));
      banner(el("accountBanner"), "ok", "Unlinked.");
      await Promise.all([loadIdentities(), loadScope()]);
    } catch (err) {
      banner(el("accountBanner"), "error", describe(err));
    }
  });
}

// ---- recovery codes ----

// Ten codes, rendered the same way wherever they appear: at registration,
// on the Account page, and after a regenerate.
function renderCodes(box, codes, note) {
  const list = codes
    .map(
      (c) =>
        `<code class="${c.used ? "used" : ""}">${escapeHtml(c.code || "unreadable")}</code>` +
        (c.used ? " <span class=\"route-hint\">used</span>" : "")
    )
    .join("<br>");

  box.classList.remove("hidden");
  box.innerHTML =
    `<p class="route-hint">${escapeHtml(note)}</p><p>${list}</p>` +
    `<p class="route-hint">Each code works once. Keep them somewhere that is not this ` +
    `browser, because this browser is the thing you might lose.</p>`;
}

// Shown once, right after an account is created or backfilled at sign in.
function showFreshCodes(codes) {
  if (!Array.isArray(codes) || !codes.length) return;
  renderCodes(
    el("recoveryCodesResult"),
    codes.map((code, i) => ({ position: i + 1, code, used: false })),
    "Save these ten recovery codes. They are the way back into this account if you lose everything else."
  );
  banner(el("accountBanner"), "ok", "New recovery codes are on this page. Save them now.");
}

function wireRecoveryCodes() {
  const form = el("recoveryViewForm");
  const status = el("recoveryViewBanner");
  const box = el("recoveryCodesResult");

  async function reveal(regenerate) {
    const password = el("recoveryViewPassword").value;
    if (!password) {
      banner(status, "error", "Enter your password first.");
      return;
    }

    el("recoveryView").disabled = true;
    el("recoveryRegenerate").disabled = true;
    try {
      const data = regenerate
        ? await api.regenerateRecoveryCodes(password)
        : await api.revealRecoveryCodes(password);
      banner(status, "ok", null);
      el("recoveryViewPassword").value = "";
      renderCodes(
        box,
        data.codes,
        data.regenerated
          ? "A fresh set of ten. Any code from the old set has stopped working."
          : "Your recovery codes."
      );
      await refreshRecoveryCount();
    } catch (err) {
      banner(status, "error", describe(err));
    } finally {
      el("recoveryView").disabled = false;
      el("recoveryRegenerate").disabled = false;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    reveal(false);
  });

  el("recoveryRegenerate").addEventListener("click", async () => {
    const sure = await confirmDialog({
      title: "Replace your recovery codes?",
      body:
        "The ten you have now stop working immediately, including any you have written " +
        "down or printed. You get a fresh set to save.",
      confirmLabel: "Replace them",
      cancelLabel: "Keep the old ones",
    });
    if (sure) reveal(true);
  });
}

async function refreshRecoveryCount() {
  try {
    const { remaining } = await api.recoveryCodeCount();
    el("recoveryCodesHint").textContent =
      remaining > 0
        ? `${remaining} of your codes are unused. They are the way back in when nothing else ` +
          "works, including losing the Discord or Telegram account you connected."
        : "You have no unused recovery codes left. Replace them to get a fresh ten.";
  } catch {
    // Cosmetic. The controls below still work without the count.
  }
}

// Redeeming a code on the sign in screen. It does not set a password, it
// unlocks the same reset form the emailed code does.
function wireRecoveryRedeem(showConfirmStep) {
  el("recoveryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = el("recoveryBanner");
    const email = el("resetEmail").value.trim();
    const code = el("recoveryCode").value.trim();

    if (!email) {
      banner(status, "error", "Enter the account's email above first.");
      return;
    }

    el("recoverySubmit").disabled = true;
    try {
      const data = await api.redeemRecoveryCode(email, code);
      banner(status, "ok", null);
      el("recoveryCode").value = "";
      showConfirmStep(data.token, data.remaining);
    } catch (err) {
      banner(status, "error", describe(err));
    } finally {
      el("recoverySubmit").disabled = false;
    }
  });
}

// ---- passkeys ----

function wirePasskey() {
  el("passkeyAdd").addEventListener("click", async () => {
    const status = el("accountBanner");
    el("passkeyAdd").disabled = true;
    try {
      const options = await api.passkey({ step: "register-challenge" });
      const result = await registerPasskey(options);
      await api.passkey(result);
      banner(
        status,
        "ok",
        "Passkey saved. Next time you can sign in with this device instead of a password."
      );
      await paintPasskeyOffer();
    } catch (err) {
      if (wasCancelled(err)) banner(status, "ok", null);
      else banner(status, "error", describe(err));
    } finally {
      el("passkeyAdd").disabled = false;
    }
  });

  el("passkeySignIn").addEventListener("click", async () => {
    const status = el("authBanner");
    el("passkeySignIn").disabled = true;
    try {
      const options = await api.passkey({ step: "login-challenge" });
      const assertion = await assertPasskey(options);
      const data = await api.passkey(assertion);
      auth.applyUser(data.user);
      banner(status, "ok", null);
      paintAuthState();
      await refreshAll();
    } catch (err) {
      if (wasCancelled(err)) banner(status, "ok", null);
      else banner(status, "error", describe(err));
    } finally {
      el("passkeySignIn").disabled = false;
    }
  });
}

// The offer is only made where it can actually be taken up: a device with
// biometrics or a screen lock, in a browser that can report the public key.
async function paintPasskeyOffer() {
  const usable = await deviceCanVerify();
  el("passkeyRow").classList.toggle("hidden", !usable);
  el("passkeySignInRow").classList.toggle("hidden", !usable);
  if (!usable) {
    el("passkeyHint").textContent =
      "This device cannot do passkeys, so signing in here stays a password.";
  }
}

// ---- changing a known password ----

function wirePassword() {
  const form = el("passwordForm");
  const status = el("passwordBanner");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const current = el("currentPassword").value;
    const next = el("newPassword").value;

    el("passwordSubmit").disabled = true;
    try {
      const data = await api.changePassword(current, next);
      form.reset();
      const others = data.other_sessions_ended
        ? ` ${data.other_sessions_ended} other signed in browser${
            data.other_sessions_ended === 1 ? " was" : "s were"
          } signed out.`
        : "";
      banner(status, "ok", `Password changed.${others}`);
    } catch (err) {
      banner(status, "error", describe(err));
    } finally {
      el("passwordSubmit").disabled = false;
    }
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
  // Nothing to paint when the panel holding it is hidden.
  if (!auth.state.signedIn) return;

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
  await suggestNtfyTopic();
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

// ---- ntfy ----

function wireNtfy() {
  const status = el("accountBanner");

  el("ntfyAdd").addEventListener("click", async () => {
    const input = el("ntfyTopic");
    const topic = input.value.trim();
    if (!topic) return;
    try {
      const result = await api.addNtfy(topic);
      el("ntfyHint").textContent = `Subscribe to ${result.url} in the ntfy app.`;
      input.value = "";
      banner(status, "ok", "That topic will receive posts.");
      await refreshAll();
    } catch (err) {
      banner(status, "error", describe(err));
    }
  });
}

// A generated topic, offered rather than imposed. Anyone who knows the
// name can read it, so a memorable one is a guessable one.
async function suggestNtfyTopic() {
  if (!auth.state.signedIn) return;
  try {
    const data = await api.ntfySuggestion();
    el("ntfyTopic").placeholder = data.suggested_topic;
    el("ntfyTopic").value = data.suggested_topic;
  } catch {
    // Not fatal: the field still accepts a topic typed by hand.
  }
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
  wireReset();
  wirePassword();
  wireRecoveryCodes();
  wirePasskey();
  wireScope();
  wireIdentities();
  paintPasskeyOffer();
  wireSources();
  wireOpml();
  wirePush();
  wireLink();
  wireNtfy();
  destinations.wire(el("destinationList"), el("accountBanner"), () =>
    destinations.load(el("destinationList"), el("accountBanner"))
  );
  registerServiceWorker();

  // Any 401, from any call, means the session is gone whatever the hint
  // said. This is what stops a stale hint leaving signed in controls on
  // screen with nothing behind them.
  handleUnauthorized(() => {
    auth.applySignedOut();
    paintAuthState();
  });

  // Optimistic, from the stored hint, so the shell does not flicker.
  auth.primeFromHint();
  paintAuthState();

  const outcome = readDiscordOutcome();
  if (outcome) {
    const [kind, message] = DISCORD_OUTCOMES[outcome] || ["error", "Discord sign in did not finish."];
    if (message) banner(kind === "ok" ? el("accountBanner") : el("authBanner"), kind, message);
  }

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
  await suggestNtfyTopic();
}

boot();
