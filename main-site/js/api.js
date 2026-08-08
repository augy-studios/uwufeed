// One place that knows how to talk to /api. Same origin, so the session
// cookie rides along on its own.

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
    throw error;
  }
  return payload;
}

export const api = {
  listItems: (cursor) =>
    request(`/api/items/list${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  resolveSource: (url) => request("/api/sources/resolve", { method: "POST", body: { url } }),
  unsubscribeSource: (sourceId) =>
    request("/api/sources/unsubscribe", { method: "POST", body: { source_id: sourceId } }),
  registerWebPush: (subscription) =>
    request("/api/targets/webpush", { method: "POST", body: { subscription } }),
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (email, password) =>
    request("/api/auth/register", { method: "POST", body: { email, password } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
};

// A 501 means the endpoint belongs to a phase that has not started, which
// is a different thing from a failure and should read that way in the UI.
export function isNotImplemented(err) {
  return err && err.status === 501;
}
