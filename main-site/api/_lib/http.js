// Request and response helpers shared by every function.
// Vercel ignores directories prefixed with an underscore, so nothing in
// _lib/ is routable.

export function json(res, status, body) {
  res.status(status).setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
}

export function text(res, status, body) {
  res.status(status).setHeader("content-type", "text/plain; charset=utf-8");
  res.send(body);
}

// 204 carries no body, so it must not be sent one.
export function noContent(res) {
  res.status(204).end();
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("allow", allowed.join(", "));
  json(res, 405, { error: "method_not_allowed" });
}

// The raw bytes, needed because the WebSub signature covers the body
// exactly as sent. Vercel may have parsed it already for known content
// types, so handle both cases.
export async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (req.body && typeof req.body === "object") {
    return Buffer.from(JSON.stringify(req.body), "utf8");
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = await readRawBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }
}

// Privileged endpoints fail closed. An unset ADMIN_TOKEN is a
// misconfiguration, not permission to run without one.
export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    json(res, 503, { error: "admin_token_not_configured" });
    return false;
  }
  const header = req.headers.authorization || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqualString(supplied, expected)) {
    json(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
}

export function timingSafeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const USER_AGENT = `uwuFeed/0.1 (+${process.env.PUBLIC_BASE_URL || "https://feed.uwuapps.org"}; ${
  process.env.USER_AGENT_CONTACT || "contact not configured"
})`;
