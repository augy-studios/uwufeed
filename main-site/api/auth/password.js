// Change the password of the signed in account.
//
// Distinct from reset: this one proves the current password rather than
// proving reach of a linked chat, so it never needs a code and never
// touches a bot.

import { selectOne, update, remove } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { hashPassword, verifyPassword } from "../_lib/password.js";
import { readSession, readCookie, hashToken, SESSION_COOKIE } from "../_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  const current = typeof body.current_password === "string" ? body.current_password : "";
  const next = typeof body.new_password === "string" ? body.new_password : "";

  if (next.length < 8) return json(res, 400, { error: "password_too_short" });
  if (next === current) return json(res, 400, { error: "password_unchanged" });

  const user = await selectOne(
    "uwufeed_users",
    `id=eq.${session.userId}&select=id,email,username,password_hash`
  );
  if (!user) return json(res, 401, { error: "not_signed_in" });

  // A null hash is an account created by a bot, which has no password to
  // prove. verifyPassword returns false for it, so this needs no special
  // case, but the error it produces would be misleading.
  if (!user.password_hash) return json(res, 409, { error: "no_password_set" });

  if (!(await verifyPassword(current, user.password_hash))) {
    return json(res, 403, { error: "current_password_wrong" });
  }

  const hash = await hashPassword(next);
  await update("uwufeed_users", `id=eq.${user.id}`, { password_hash: hash });

  // Every other session goes, which is the point of changing a password
  // somebody else may know. This one stays, so the tab doing it is not
  // signed out mid action.
  const keep = hashToken(readCookie(req, SESSION_COOKIE));
  const ended = await remove(
    "uwufeed_sessions",
    `user_id=eq.${user.id}&token_hash=neq.${encodeURIComponent(keep)}`
  );

  return json(res, 200, { changed: true, other_sessions_ended: ended });
}
