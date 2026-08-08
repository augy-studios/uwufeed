// Delete the account.
//
// Everything hanging off uwufeed_users cascades: sessions, identities,
// subscriptions, targets, recovery codes, passkeys, deliveries. Sources do
// not, and must not. A source row is shared by everybody following it, so
// deleting one account has to leave it exactly where it is.
//
// Requires the password, and requires typing the account's own name. The
// password proves who is asking; the typed name proves they read what they
// were about to do. Neither alone is enough for something with no undo.

import { remove, select, selectOne } from "../_lib/db.js";
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
    `id=eq.${session.userId}&select=id,email,username,password_hash,display_name`
  );
  if (!user) return json(res, 401, { error: "not_signed_in" });

  // A space's account is not a person's to delete. It belongs to everyone
  // in that server or group, and the person asking merely manages it.
  const space = await selectOne("uwufeed_spaces", `user_id=eq.${user.id}&select=id`);
  if (space) return json(res, 409, { error: "cannot_delete_a_space" });

  // The name they have to type back. Whatever the interface shows them.
  const expected = user.username || user.email || user.display_name || "";
  const typed = typeof body.confirm === "string" ? body.confirm.trim() : "";
  if (!expected || typed.toLowerCase() !== expected.toLowerCase()) {
    return json(res, 400, { error: "confirmation_did_not_match" });
  }

  // An account signed in only by passkey or chat has no password to prove.
  if (user.password_hash) {
    const password = typeof body.password === "string" ? body.password : "";
    if (!(await verifyPassword(password, user.password_hash))) {
      return json(res, 403, { error: "current_password_wrong" });
    }
  }

  // What is about to be given up, reported back so the client can say it
  // plainly rather than "done".
  const subscriptions = await select(
    "uwufeed_subscriptions",
    `user_id=eq.${user.id}&select=source_id`
  );

  await remove("uwufeed_users", `id=eq.${user.id}`);

  res.setHeader("set-cookie", clearCookieHeader());

  return json(res, 200, {
    deleted: true,
    subscriptions_removed: subscriptions.length,
  });
}
