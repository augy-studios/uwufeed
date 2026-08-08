// One place that knows how to talk to /api. Same origin, so the session
// cookie rides along on its own.

// Any 401 from anywhere means the session is gone, whatever the stored
// hint claimed. One handler keeps the whole interface honest rather than
// each caller remembering to check.
let onUnauthorized = null;

export function handleUnauthorized(fn) {
  onUnauthorized = fn;
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  const raw = await res.text();
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { error: "bad_response" };
    }
  }

  if (!res.ok) {
    const error = new Error((payload && payload.error) || `http_${res.status}`);
    error.status = res.status;
    error.payload = payload;
    // Logout answers 204, so it never lands here. Everything else that
    // meets an expired session flips the interface to signed out.
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw error;
  }
  return payload;
}

// Which account the interface is acting as: the person, or a server or
// group they manage. One module holds it so no caller has to remember to
// pass it, and the server checks the permission regardless.
let scopeId = null;

export function setScope(id) {
  scopeId = id || null;
}

export function currentScope() {
  return scopeId;
}

function scoped(path) {
  if (!scopeId) return path;
  return path + (path.includes("?") ? "&" : "?") + `as=${encodeURIComponent(scopeId)}`;
}

export const api = {
  listItems: (cursor) =>
    request(scoped(`/api/items/list${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)),

  listSources: () => request(scoped("/api/subscriptions/list")),
  addSource: (url) => request(scoped("/api/subscriptions/add"), { method: "POST", body: { url } }),
  removeSource: (sourceId) =>
    request(scoped("/api/subscriptions/remove"), { method: "POST", body: { source_id: sourceId } }),
  routeSource: (sourceId, targetIds) =>
    request(scoped("/api/subscriptions/route"), {
      method: "POST",
      body: { source_id: sourceId, target_ids: targetIds },
    }),

  // The only endpoint that answers without a session.
  stats: () => request("/api/stats"),
  listSpaces: () => request("/api/spaces"),
  listIdentities: () => request("/api/account/identities"),
  unlinkIdentity: (id) =>
    request("/api/account/identities", { method: "DELETE", body: { id } }),
  mergePreview: (from) =>
    request(`/api/account/merge?from=${encodeURIComponent(from)}`),
  merge: (from) => request("/api/account/merge", { method: "POST", body: { from } }),

  listTargets: () => request(scoped("/api/targets/list")),
  setTargetPreferences: (prefs) =>
    request("/api/targets/preferences", { method: "POST", body: prefs }),
  ntfySuggestion: () => request("/api/targets/ntfy"),
  addNtfy: (topic) => request("/api/targets/ntfy", { method: "POST", body: { topic } }),

  vapidKey: () => request("/api/targets/webpush"),
  registerWebPush: (subscription) =>
    request("/api/targets/webpush", { method: "POST", body: { subscription } }),
  removeWebPush: (subscription) =>
    request("/api/targets/webpush", { method: "DELETE", body: { subscription } }),

  // One field. The server decides whether it is an email or a username
  // by whether it contains an @.
  login: (identifier, password) =>
    request("/api/auth/login", { method: "POST", body: { identifier, password } }),
  register: (email, password, username) =>
    request("/api/auth/register", { method: "POST", body: { email, password, username } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  logoutAll: (password) =>
    request("/api/auth/logout-all", { method: "POST", body: { password } }),
  deleteAccount: (confirm, password) =>
    request("/api/account/delete", { method: "POST", body: { confirm, password } }),
  linkCode: () => request("/api/auth/link", { method: "POST" }),

  requestReset: (email) => request("/api/auth/reset", { method: "POST", body: { email } }),
  redeemRecoveryCode: (email, code) =>
    request("/api/auth/recovery", { method: "POST", body: { email, code } }),

  recoveryCodeCount: () => request("/api/account/recovery-codes"),
  revealRecoveryCodes: (password) =>
    request("/api/account/recovery-codes", { method: "POST", body: { password } }),
  regenerateRecoveryCodes: (password) =>
    request("/api/account/recovery-codes", {
      method: "POST",
      body: { password, regenerate: true },
    }),

  passkey: (body) => request("/api/auth/passkey", { method: "POST", body }),

  confirmReset: (token, password) =>
    request("/api/auth/reset-confirm", { method: "POST", body: { token, password } }),
  changePassword: (currentPassword, newPassword) =>
    request("/api/auth/password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    }),
};

// A 501 means the endpoint is not built yet, which is a different thing
// from a failure and should read that way in the UI.
export function isNotImplemented(err) {
  return err && err.status === 501;
}

export function isSignedOut(err) {
  return err && err.status === 401;
}

// Error codes the API returns, in words a person can act on.
const MESSAGES = {
  invalid_credentials: "That does not match an account. Check the email or username, and the password.",
  email_taken: "There is already an account with that email.",
  username_taken: "That username is taken.",
  password_too_short: "Passwords need at least 8 characters.",
  invalid_email: "That does not look like an email address.",
  invalid_username: "Usernames can use letters, numbers and underscores, 3 to 32 characters.",
  source_limit_reached: "You are at the limit of 50 sources. Remove one first.",
  no_feed_found: "No feed there. That page does not publish one that can be found.",
  fetch_failed: "That site could not be reached.",
  feed_fetch_failed: "The feed was found but could not be read.",
  invalid_url: "That does not look like a link.",
  invalid_topic: "Topics need 8 to 64 letters, numbers, dashes or underscores.",
  quiet_hours_need_both: "Set both a start and an end time, or neither.",
  invalid_time: "Times look like 23:00.",
  invalid_timezone: "That is not a timezone name.",
  target_not_found: "That destination is not yours.",
  unsupported_scheme: "Only http and https links work.",
  not_signed_in: "Sign in first.",
  offline: "You appear to be offline.",
  account_not_found: "No account with that email.",
  invalid_reset_code: "That code is not valid any more. They last 15 minutes and work once.",
  reset_delivery_failed: "The code could not be sent to your connected chat. Try again.",
  no_chat_connected: "That account has no connected chat, and resetting without one is switched off here.",
  current_password_wrong: "That is not your current password.",
  password_unchanged: "The new password is the same as the old one.",
  no_password_set: "This account signs in from a chat and has no password to change.",
  invalid_recovery_code: "That recovery code is not valid, or has already been used.",
  passkey_not_recognised: "That passkey is not recognised. Sign in another way.",
  passkey_already_registered: "This device already has a passkey on this account.",
  passkey_replay_suspected: "That passkey looks copied and was refused. Sign in another way.",
  challenge_expired: "That took too long. Try again.",
  user_not_verified: "Your device needs to check it is you, with biometrics or a screen lock.",
  origin_mismatch: "Something is wrong with this page's address. Do not continue.",
  unknown_step: "Something went wrong. Try again.",
  not_your_space: "You do not manage that server or group any more.",
  unknown_space: "That server or group is not here.",
  last_way_in: "That is the only way into this account. Set a password or keep some recovery codes first.",
  cannot_merge_a_space: "A server or group is shared, so it is never merged into one person's account.",
  not_a_chat_account: "That account has its own sign in, so it cannot be merged.",
  not_your_account: "That account is not connected to yours.",
  discord_oauth_not_configured: "Discord sign in is not set up on this instance.",
  confirmation_did_not_match: "That did not match your username. Type it exactly.",
  cannot_delete_a_space: "This is a server or group account, which belongs to everyone in it.",
};

export function describe(err) {
  return MESSAGES[err && err.message] || "Something went wrong. Try again.";
}
