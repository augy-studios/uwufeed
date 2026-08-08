// Session handling for the shared auth tables, uwu_users and
// uwu_sessions. Never Supabase Auth.
//
// Those tables already exist and are shared across the uwu suite, so this
// code follows their shape rather than defining it. See db/shared-auth.md.
//
// TODO Phase 4. Planned surface:
//   createSession(userId) -> { token, expiresAt }, stores a hash of the token
//   readSession(req)      -> { userId } or null, from the uwufeed_session cookie
//   destroySession(token) -> void
//   cookieHeader(token, expiresAt) -> Set-Cookie, HttpOnly, Secure, SameSite=Lax
//
// Two things about the existing schema that are easy to get wrong:
//   - uwu_sessions.user_id is nullable, so a row can exist with no user.
//     Treat a null user_id as an invalid session.
//   - uwu_users.email is plain text, not citext, so uniqueness is case
//     sensitive. Normalize before every insert and every lookup.

export const SESSION_COOKIE = "uwufeed_session";
export const SESSION_TTL_DAYS = 30;

// The email column is case sensitive and shared, so normalising here is the
// only thing standing between one person and two accounts.
export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}
