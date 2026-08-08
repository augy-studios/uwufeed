// Finish a password reset with the code that went to a linked chat.
//
// The code is verified against the account's current password hash, so it
// stops working the instant the password changes. That is what makes it
// single use without a table to record spent codes in.

import { selectOne, update, remove } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { hashPassword } from "../_lib/password.js";
import { unverifiedUserId, verify } from "../_lib/resettoken.js";
import { createSession, cookieHeader } from "../_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (password.length < 8) return json(res, 400, { error: "password_too_short" });

  // The id in the code says which hash to check the signature against. It
  // is not trusted for anything else, and a forged one simply fails below.
  const claimed = unverifiedUserId(token);
  if (!claimed) return json(res, 400, { error: "invalid_reset_code" });

  const user = await selectOne(
    "uwufeed_users",
    `id=eq.${claimed}&select=id,email,username,password_hash`
  );
  if (!user) return json(res, 400, { error: "invalid_reset_code" });

  if (verify(token, user.password_hash) !== user.id) {
    return json(res, 400, { error: "invalid_reset_code" });
  }

  const hash = await hashPassword(password);
  await update("uwufeed_users", `id=eq.${user.id}`, { password_hash: hash });

  // A reset is what somebody does when they suspect they have lost control
  // of the account, so every session goes before the new one is made.
  await remove("uwufeed_sessions", `user_id=eq.${user.id}`);

  const { token: sessionToken, expiresAt } = await createSession(user.id);
  res.setHeader("set-cookie", cookieHeader(sessionToken, expiresAt));

  return json(res, 200, {
    user: { id: user.id, email: user.email, username: user.username },
  });
}
