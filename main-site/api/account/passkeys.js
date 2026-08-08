// The passkeys on this account, and removing one.
//
// The interface needs the list for a reason worth stating: WebAuthn gives a
// site no way to ask whether the authenticator in front of it already holds
// a credential. So the browser remembers which credential id it registered,
// and this endpoint says which ids the account still has. The two together
// answer "is there a passkey on this device", which neither can answer
// alone.

import { remove, select, selectOne } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { verifyPassword } from "../_lib/password.js";
import { readSession } from "../_lib/session.js";
import { hasAnotherWayIn } from "../_lib/waysin.js";

export default async function handler(req, res) {
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  if (req.method === "GET") return list(res, session.userId);
  if (req.method === "DELETE") return unregister(req, res, session.userId);
  return methodNotAllowed(res, ["GET", "DELETE"]);
}

async function list(res, userId) {
  const rows = await select(
    "uwufeed_passkeys",
    `user_id=eq.${userId}&select=id,credential_id,label,created_at,last_used_at&order=created_at.asc`
  );

  return json(res, 200, {
    passkeys: rows.map((row) => ({
      id: row.id,
      // The client compares this against what it stored locally. It is not
      // a secret: a credential id is public, and holding one proves nothing
      // without the private key it names.
      credential_id: row.credential_id,
      label: row.label,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
    })),
  });
}

async function unregister(req, res, userId) {
  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  // By credential id, because that is what the browser knows about itself.
  const credentialId = typeof body.credential_id === "string" ? body.credential_id : "";
  if (!credentialId) return json(res, 400, { error: "unknown_passkey" });

  const passkey = await selectOne(
    "uwufeed_passkeys",
    `credential_id=eq.${encodeURIComponent(credentialId)}&user_id=eq.${userId}&select=id`
  );
  if (!passkey) return json(res, 404, { error: "unknown_passkey" });

  // The password, when the account has one. Removing a sign in method is a
  // security setting, and the interface asks for it, so the endpoint has to
  // actually check it. A field that is collected and ignored is worse than
  // no field: it teaches people the prompt does not matter.
  const user = await selectOne("uwufeed_users", `id=eq.${userId}&select=password_hash`);
  if (user && user.password_hash) {
    const password = typeof body.password === "string" ? body.password : "";
    if (!(await verifyPassword(password, user.password_hash))) {
      return json(res, 403, { error: "current_password_wrong" });
    }
  }

  if (!(await hasAnotherWayIn(userId, { passkeyId: passkey.id }))) {
    return json(res, 409, { error: "last_way_in" });
  }

  await remove("uwufeed_passkeys", `id=eq.${passkey.id}&user_id=eq.${userId}`);

  return json(res, 200, { removed: true });
}
