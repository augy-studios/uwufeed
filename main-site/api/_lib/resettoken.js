// Password reset codes.
//
// Signed rather than stored, like the link token, with two differences that
// matter.
//
// A different HMAC label, so a link token can never be replayed as a reset
// code or the reverse. They share LINK_TOKEN_SECRET because a second secret
// is a second thing to forget to set, and an unset one would take reset
// down without anybody noticing until somebody needed it.
//
// The account's current password hash is mixed into the signature, which
// makes a code single use for free: the moment the password changes the
// signature stops verifying. No table, no expiry sweep, no replay window
// after the code has been spent.
//
// Layout, base64url of: version | user uuid (16 bytes) | expiry (4 bytes,
// unix seconds) | truncated HMAC (10 bytes).

import crypto from "node:crypto";

const VERSION = 1;
const MAC_BYTES = 10;
const LABEL = "uwufeed/password-reset/v1";
const PAYLOAD_BYTES = 21;

export const TTL_SECONDS = 900;

function secret() {
  const value = process.env.LINK_TOKEN_SECRET;
  if (!value) throw new Error("link_token_secret_not_configured");
  return value;
}

// The password hash is part of the signed material rather than the payload,
// so it binds the code to one password without being carried in it.
function mac(payload, passwordHash) {
  return crypto
    .createHmac("sha256", secret())
    .update(LABEL)
    .update(payload)
    .update(String(passwordHash ?? ""))
    .digest()
    .subarray(0, MAC_BYTES);
}

export function issue(userId, passwordHash, ttlSeconds = TTL_SECONDS) {
  const payload = Buffer.alloc(PAYLOAD_BYTES);
  payload.writeUInt8(VERSION, 0);
  Buffer.from(userId.replace(/-/g, ""), "hex").copy(payload, 1);
  payload.writeUInt32BE(Math.floor(Date.now() / 1000) + ttlSeconds, 17);

  return Buffer.concat([payload, mac(payload, passwordHash)]).toString("base64url");
}

// The user id without checking the signature. Only good for looking up the
// row whose hash the signature is then checked against, which is why it is
// named for what it is.
export function unverifiedUserId(token) {
  const payload = decode(token);
  return payload ? uuidFrom(payload) : null;
}

// Returns the user id, or null. Never throws on malformed input, because
// this is handed whatever a user pasted.
export function verify(token, passwordHash) {
  const raw = decodeRaw(token);
  if (!raw) return null;

  const payload = raw.subarray(0, PAYLOAD_BYTES);
  const supplied = raw.subarray(PAYLOAD_BYTES);

  const expected = mac(payload, passwordHash);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return null;
  }
  if (payload.readUInt32BE(17) < Math.floor(Date.now() / 1000)) return null;

  return uuidFrom(payload);
}

function decodeRaw(token) {
  let raw;
  try {
    raw = Buffer.from(String(token).trim(), "base64url");
  } catch {
    return null;
  }
  if (raw.length !== PAYLOAD_BYTES + MAC_BYTES) return null;
  if (raw.readUInt8(0) !== VERSION) return null;
  return raw;
}

function decode(token) {
  const raw = decodeRaw(token);
  return raw ? raw.subarray(0, PAYLOAD_BYTES) : null;
}

function uuidFrom(payload) {
  const hex = payload.subarray(1, 17).toString("hex");
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20),
  ].join("-");
}
