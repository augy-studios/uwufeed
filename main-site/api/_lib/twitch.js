// Twitch EventSub: signature verification and subscription management.
//
// Unlike WebSub, the signature covers more than the body, and Twitch
// expects the challenge echoed as raw text on verification.

import crypto from "node:crypto";

import { USER_AGENT } from "./http.js";

const HELIX = "https://api.twitch.tv/helix";
const OAUTH = "https://id.twitch.tv/oauth2/token";

// Twitch replays are cheap to mount and cheap to refuse.
const MAX_AGE_MS = 10 * 60 * 1000;

export function configured() {
  return Boolean(
    process.env.TWITCH_CLIENT_ID &&
      process.env.TWITCH_CLIENT_SECRET &&
      process.env.TWITCH_EVENTSUB_SECRET
  );
}

// HMAC over message id + timestamp + raw body, not the body alone. Signing
// only the body would let a captured notification be replayed under a new
// id forever.
export function verifySignature(headers, rawBody) {
  const secret = process.env.TWITCH_EVENTSUB_SECRET;
  if (!secret) return { ok: false, reason: "secret_not_configured" };

  const id = headers["twitch-eventsub-message-id"];
  const timestamp = headers["twitch-eventsub-message-timestamp"];
  const signature = headers["twitch-eventsub-message-signature"];
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };

  const age = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > MAX_AGE_MS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", secret)
      .update(Buffer.concat([Buffer.from(id + timestamp, "utf8"), rawBody]))
      .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}

// App access token, client credentials. Short lived and cheap to fetch, so
// it is not cached: a serverless function rarely lives long enough to
// reuse one anyway.
export async function appToken() {
  const res = await fetch(OAUTH, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }).toString(),
  });
  if (!res.ok) throw new Error(`twitch token ${res.status}`);
  return (await res.json()).access_token;
}

async function helix(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${HELIX}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "client-id": process.env.TWITCH_CLIENT_ID,
      "content-type": "application/json",
      "user-agent": USER_AGENT,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

// login is the name in the URL, for example twitch.tv/somebody.
export async function lookupUser(login) {
  const token = await appToken();
  const res = await helix(`/users?login=${encodeURIComponent(login)}`, { token });
  if (!res.ok || !res.body.data || !res.body.data.length) return null;
  const user = res.body.data[0];
  return { id: user.id, login: user.login, name: user.display_name };
}

export async function subscribeStreamOnline(broadcasterId, callbackUrl) {
  const token = await appToken();
  return helix("/eventsub/subscriptions", {
    method: "POST",
    token,
    body: {
      type: "stream.online",
      version: "1",
      condition: { broadcaster_user_id: String(broadcasterId) },
      transport: {
        method: "webhook",
        callback: callbackUrl,
        secret: process.env.TWITCH_EVENTSUB_SECRET,
      },
    },
  });
}

export const MESSAGE_TYPES = {
  VERIFICATION: "webhook_callback_verification",
  NOTIFICATION: "notification",
  REVOCATION: "revocation",
};
