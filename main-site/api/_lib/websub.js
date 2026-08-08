// WebSub subscriber side: callback URLs, signature checks, and the
// subscription request itself.

import crypto from "node:crypto";
import { USER_AGENT } from "./http.js";

const DEFAULT_LEASE = 864000; // 10 days, the cap Google's hub applies anyway

export function leaseSeconds() {
  const configured = parseInt(process.env.WEBSUB_LEASE_SECONDS || "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LEASE;
}

export function newSourceSecret() {
  return crypto.randomBytes(24).toString("hex");
}

// The callback carries the source id, so it has to carry proof that we
// issued it. Without this the endpoint is an open probe for source ids.
export function callbackToken(sourceId) {
  const secret = process.env.WEBSUB_CALLBACK_SECRET;
  if (!secret) throw new Error("websub_callback_secret_not_configured");
  return crypto.createHmac("sha256", secret).update(`source:${sourceId}`).digest("hex").slice(0, 32);
}

export function verifyCallbackToken(sourceId, supplied) {
  if (!supplied) return false;
  let expected;
  try {
    expected = callbackToken(sourceId);
  } catch {
    return false;
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(supplied), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function callbackUrl(sourceId) {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("public_base_url_not_configured");
  return `${base}/api/hooks/websub?source_id=${sourceId}&t=${callbackToken(sourceId)}`;
}

// X-Hub-Signature is "sha1=hex" or "sha256=hex" over the raw body.
export function verifySignature(rawBody, header, secret) {
  if (!secret) return { ok: false, reason: "no_secret_stored" };
  if (!header) return { ok: false, reason: "missing_signature" };

  const [algorithm, digest] = String(header).split("=", 2);
  if (!algorithm || !digest) return { ok: false, reason: "malformed_signature" };
  if (!["sha1", "sha256", "sha384", "sha512"].includes(algorithm)) {
    return { ok: false, reason: "unsupported_algorithm" };
  }

  const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(digest.trim().toLowerCase(), "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}

// mode is "subscribe" or "unsubscribe". The hub answers 202 and then
// verifies out of band by calling the GET handler.
export async function requestHubSubscription(source, mode = "subscribe") {
  if (!source.hub_url) return { ok: false, reason: "source_has_no_hub" };

  const form = new URLSearchParams({
    "hub.mode": mode,
    "hub.topic": source.feed_url,
    "hub.callback": callbackUrl(source.id),
    "hub.verify": "async",
    "hub.lease_seconds": String(leaseSeconds()),
  });
  if (source.websub_secret) form.set("hub.secret", source.websub_secret);

  const res = await fetch(source.hub_url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT,
    },
    body: form.toString(),
  });

  const body = await res.text();
  return {
    ok: res.status === 202 || res.status === 204 || res.ok,
    status: res.status,
    body: body.slice(0, 300),
  };
}
