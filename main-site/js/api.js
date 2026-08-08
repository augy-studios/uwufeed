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

export const api = {
  listItems: (cursor) =>
    request(`/api/items/list${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),

  listSources: () => request("/api/subscriptions/list"),
  addSource: (url) => request("/api/subscriptions/add", { method: "POST", body: { url } }),
  removeSource: (sourceId) =>
    request("/api/subscriptions/remove", { method: "POST", body: { source_id: sourceId } }),
  routeSource: (sourceId, targetIds) =>
    request("/api/subscriptions/route", {
      method: "POST",
      body: { source_id: sourceId, target_ids: targetIds },
    }),

  listTargets: () => request("/api/targets/list"),
  ntfySuggestion: () => request("/api/targets/ntfy"),
  addNtfy: (topic) => request("/api/targets/ntfy", { method: "POST", body: { topic } }),

  vapidKey: () => request("/api/targets/webpush"),
  registerWebPush: (subscription) =>
    request("/api/targets/webpush", { method: "POST", body: { subscription } }),
  removeWebPush: (subscription) =>
    request("/api/targets/webpush", { method: "DELETE", body: { subscription } }),

  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (email, password, username) =>
    request("/api/auth/register", { method: "POST", body: { email, password, username } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  linkCode: () => request("/api/auth/link", { method: "POST" }),
};

// A 501 means the endpoint belongs to a phase that has not started, which
// is a different thing from a failure and should read that way in the UI.
export function isNotImplemented(err) {
  return err && err.status === 501;
}

export function isSignedOut(err) {
  return err && err.status === 401;
}

// Error codes the API returns, in words a person can act on.
const MESSAGES = {
  invalid_credentials: "That email and password do not match.",
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
  unsupported_scheme: "Only http and https links work.",
  not_signed_in: "Sign in first.",
  offline: "You appear to be offline.",
};

export function describe(err) {
  return MESSAGES[err && err.message] || "Something went wrong. Try again.";
}
