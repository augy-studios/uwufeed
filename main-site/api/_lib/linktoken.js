// Account link tokens.
//
// The site issues one to a signed in user, the user hands it to a bot, and
// the bot verifies it locally. Signed rather than stored, so there is no
// table, no expiry sweep and no round trip from the bot back to the site.
//
// Layout, base64url of: version | user uuid (16 bytes) | expiry (4 bytes,
// unix seconds) | truncated HMAC (10 bytes). 31 bytes, 42 characters, which
// fits inside Telegram's 64 character deep link payload.

import crypto from "node:crypto";

const VERSION = 1;
const MAC_BYTES = 10;
export const TTL_SECONDS = 600;

function secret() {
  const value = process.env.LINK_TOKEN_SECRET;
  if (!value) throw new Error("link_token_secret_not_configured");
  return value;
}

function mac(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest().subarray(0, MAC_BYTES);
}

export function issue(userId, ttlSeconds = TTL_SECONDS) {
  const payload = Buffer.alloc(21);
  payload.writeUInt8(VERSION, 0);
  Buffer.from(userId.replace(/-/g, ""), "hex").copy(payload, 1);
  payload.writeUInt32BE(Math.floor(Date.now() / 1000) + ttlSeconds, 17);

  return Buffer.concat([payload, mac(payload)]).toString("base64url");
}

// Returns the user id, or null. Never throws on malformed input, because
// this is handed whatever a user pasted.
export function verify(token) {
  let raw;
  try {
    raw = Buffer.from(String(token), "base64url");
  } catch {
    return null;
  }
  if (raw.length !== 21 + MAC_BYTES) return null;

  const payload = raw.subarray(0, 21);
  const supplied = raw.subarray(21);
  if (payload.readUInt8(0) !== VERSION) return null;

  const expected = mac(payload);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return null;
  }

  if (payload.readUInt32BE(17) < Math.floor(Date.now() / 1000)) return null;

  const hex = payload.subarray(1, 17).toString("hex");
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20),
  ].join("-");
}
