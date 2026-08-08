// Sessions against uwufeed_sessions.
//
// The raw token goes to the browser in an HttpOnly cookie. Only a hash of
// it is stored, so a database leak does not hand over live sessions.

import crypto from "node:crypto";

import { insert, selectOne, remove } from "./db.js";

export const SESSION_COOKIE = "uwufeed_session";
export const SESSION_TTL_DAYS = 30;

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000);

  await insert(
    "uwufeed_sessions",
    [{ token_hash: hashToken(token), user_id: userId, expires_at: expiresAt.toISOString() }],
    { returning: false }
  );

  return { token, expiresAt };
}

export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// Returns the user, or null. Expiry is checked in the query rather than in
// JavaScript, so a clock difference here cannot extend a session.
export async function readSession(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const row = await selectOne(
    "uwufeed_sessions",
    `token_hash=eq.${hashToken(token)}&expires_at=gt.${encodeURIComponent(
      new Date().toISOString()
    )}&select=user_id,expires_at`
  );
  return row ? { userId: row.user_id, expiresAt: row.expires_at } : null;
}

export async function destroySession(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return 0;
  return remove("uwufeed_sessions", `token_hash=eq.${hashToken(token)}`);
}

export function cookieHeader(token, expiresAt) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ");
}

export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// email is citext in the database, so uniqueness is already case
// insensitive. Trimming is still ours to do.
export function normalizeEmail(email) {
  return String(email ?? "").trim();
}
