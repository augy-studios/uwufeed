// The linked services on this account, and unlinking one.
//
// An identity is who somebody is on a platform. It is what a password reset
// direct message goes to, and for Discord it is what the server list is
// built from.

import { remove, select, selectOne } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { countUnused } from "../_lib/recoverystore.js";
import { readSession } from "../_lib/session.js";

const LABELS = { telegram: "Telegram", discord: "Discord" };

export default async function handler(req, res) {
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  if (req.method === "GET") return list(res, session.userId);
  if (req.method === "DELETE") return unlink(req, res, session.userId);
  return methodNotAllowed(res, ["GET", "DELETE"]);
}

async function list(res, userId) {
  const [rows, user, passkeys] = await Promise.all([
    select(
      "uwufeed_identities",
      `user_id=eq.${userId}&select=id,platform,display_name,verified_via,created_at&order=created_at.asc`
    ),
    selectOne("uwufeed_users", `id=eq.${userId}&select=password_hash,username,email`),
    select("uwufeed_passkeys", `user_id=eq.${userId}&select=id`),
  ]);

  return json(res, 200, {
    // How this account can be signed into. The interface needs it to know
    // whether to ask for a password before a destructive action, and
    // guessing from a stored hint is how that goes wrong.
    has_password: Boolean(user && user.password_hash),
    passkeys: passkeys.length,
    name: (user && (user.username || user.email)) || null,
    identities: rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      label: LABELS[row.platform] || row.platform,
      display_name: row.display_name,
      // How it was established. A bot link proves somebody held a link
      // token; oauth proves it against the platform itself.
      verified_via: row.verified_via,
      created_at: row.created_at,
    })),
  });
}

async function unlink(req, res, userId) {
  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  const id = String(body.id ?? "").replace(/[^0-9]/g, "");
  if (!id) return json(res, 400, { error: "unknown_identity" });

  const identity = await selectOne(
    "uwufeed_identities",
    `id=eq.${id}&user_id=eq.${userId}&select=id,platform`
  );
  if (!identity) return json(res, 404, { error: "unknown_identity" });

  // Refusing to remove the last way in, rather than removing it and then
  // explaining. An account with no password, no other identity and no
  // recovery codes left is one nobody can ever sign into again, and there
  // is no undo for that.
  if (!(await hasAnotherWayIn(userId, identity.id))) {
    return json(res, 409, { error: "last_way_in" });
  }

  // Manager rows cascade with the identity, so access to any space it
  // granted goes with it. No data moves, because none ever did.
  await remove("uwufeed_identities", `id=eq.${identity.id}&user_id=eq.${userId}`);

  return json(res, 200, { unlinked: true });
}

async function hasAnotherWayIn(userId, excludingIdentityId) {
  const user = await selectOne("uwufeed_users", `id=eq.${userId}&select=password_hash`);
  if (user && user.password_hash) return true;

  const others = await select(
    "uwufeed_identities",
    `user_id=eq.${userId}&id=neq.${excludingIdentityId}&select=id&limit=1`
  );
  if (others.length) return true;

  // Recovery codes count. They are exactly the thing that covers losing a
  // linked account, so an account holding unused ones is not stranded.
  return (await countUnused(userId)) > 0;
}
