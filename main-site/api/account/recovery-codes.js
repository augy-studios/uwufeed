// The Account page's view of recovery codes.
//
// GET reports how many are left without revealing any, so the page can say
// something useful before asking for a password.
//
// POST reveals them, and requires the account password again. A signed in
// session is thirty days long and lives on whatever device is in front of
// somebody, so a session alone is a weak thing to hand ten working codes
// to. Re-entering the password makes walking past an unlocked laptop
// insufficient.
//
// POST with regenerate replaces the set, which is how an account that has
// spent most of its codes, or printed them somewhere it regrets, starts
// over.

import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { selectOne } from "../_lib/db.js";
import { verifyPassword } from "../_lib/password.js";
import { configured } from "../_lib/recoverycodes.js";
import { countUnused, issueSet, readSet } from "../_lib/recoverystore.js";
import { readSession } from "../_lib/session.js";

export default async function handler(req, res) {
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });
  if (!configured()) return json(res, 503, { error: "link_token_secret_not_configured" });

  if (req.method === "GET") {
    return json(res, 200, { remaining: await countUnused(session.userId) });
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  const user = await selectOne(
    "uwufeed_users",
    `id=eq.${session.userId}&select=id,password_hash`
  );
  if (!user) return json(res, 401, { error: "not_signed_in" });

  // An account created by a bot has no password to re-enter. It also has no
  // way to reach this page, but saying so beats a confusing 403.
  if (!user.password_hash) return json(res, 409, { error: "no_password_set" });

  const password = typeof body.password === "string" ? body.password : "";
  if (!(await verifyPassword(password, user.password_hash))) {
    return json(res, 403, { error: "current_password_wrong" });
  }

  if (body.regenerate === true) {
    const codes = await issueSet(session.userId);
    return json(res, 200, {
      codes: codes.map((code, i) => ({ position: i + 1, code, used: false })),
      regenerated: true,
    });
  }

  return json(res, 200, { codes: await readSet(session.userId), regenerated: false });
}
