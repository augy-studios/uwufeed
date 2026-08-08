// End every session on this account, including the one asking.
//
// Distinct from logout, which ends one browser, and from the quiet cleanup
// inside the password change, which keeps the caller signed in. This is the
// one somebody reaches for when they think another person has their
// account, so the calling session goes too. Leaving it alive would mean an
// attacker who triggered it stayed signed in.
//
// The password is required. A session alone is a thirty day cookie on
// whatever device is in front of somebody, and signing every device out of
// an account is not something a borrowed laptop should be able to do.

import { remove, selectOne } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { verifyPassword } from "../_lib/password.js";
import { clearCookieHeader, readSession } from "../_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  const user = await selectOne(
    "uwufeed_users",
    `id=eq.${session.userId}&select=id,password_hash`
  );
  if (!user) return json(res, 401, { error: "not_signed_in" });

  // An account with no password signs in from a chat or a passkey. There is
  // nothing to prove, and refusing outright would strand exactly the people
  // most likely to need this.
  if (user.password_hash) {
    const password = typeof body.password === "string" ? body.password : "";
    if (!(await verifyPassword(password, user.password_hash))) {
      return json(res, 403, { error: "current_password_wrong" });
    }
  }

  const ended = await remove("uwufeed_sessions", `user_id=eq.${user.id}`);

  // Clear this browser's cookie as well as the row behind it, so the tab
  // that asked does not sit holding a token that no longer resolves.
  res.setHeader("set-cookie", clearCookieHeader());

  return json(res, 200, { signed_out: true, sessions_ended: ended });
}
