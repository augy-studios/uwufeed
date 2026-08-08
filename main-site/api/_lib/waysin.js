// Whether an account would still be reachable after removing something.
//
// Four things can get somebody in: a password, a linked service, a passkey,
// and an unused recovery code. Removing the last of them leaves an account
// nobody can ever sign into again, and there is no undo for that, so every
// removal endpoint asks here first.
//
// One file rather than one copy per endpoint, because the day a fifth way
// in is added, three separate copies of this list is how one of them gets
// missed and starts locking people out.

import { select, selectOne } from "./db.js";
import { countUnused } from "./recoverystore.js";

// `excluding` names the thing about to be removed, so it is not counted as
// a reason it is safe to remove itself.
export async function hasAnotherWayIn(userId, excluding = {}) {
  const user = await selectOne("uwufeed_users", `id=eq.${userId}&select=password_hash`);
  if (user && user.password_hash) return true;

  const identities = await select(
    "uwufeed_identities",
    `user_id=eq.${userId}&select=id` +
      (excluding.identityId ? `&id=neq.${excluding.identityId}` : "") +
      "&limit=1"
  );
  if (identities.length) return true;

  const passkeys = await select(
    "uwufeed_passkeys",
    `user_id=eq.${userId}&select=id` +
      (excluding.passkeyId ? `&id=neq.${excluding.passkeyId}` : "") +
      "&limit=1"
  );
  if (passkeys.length) return true;

  // Recovery codes count, and are the thing specifically designed to cover
  // losing everything else.
  return (await countUnused(userId)) > 0;
}
