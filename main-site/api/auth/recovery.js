// Redeem a recovery code.
//
// This is the route back in that depends on nothing still working. Not a
// mailbox, not a Telegram account, not a Discord account. Losing the linked
// account is exactly the case the other paths cannot cover, which is why
// this one is always available rather than being a fallback.
//
// Redeeming does not set a password. It spends the code and hands back the
// same short lived token /api/auth/reset issues, so the person lands on the
// ordinary reset screen and chooses a password there. One place sets a
// password, whatever proved the right to set it.

import { select, selectOne, update } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { match } from "../_lib/recoverycodes.js";
import { issue, TTL_SECONDS } from "../_lib/resettoken.js";
import { normalizeEmail } from "../_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  const email = normalizeEmail(body.email);
  const supplied = typeof body.code === "string" ? body.code : "";
  if (!email.includes("@")) return json(res, 400, { error: "invalid_email" });

  const user = await selectOne(
    "uwufeed_users",
    `email=eq.${encodeURIComponent(email)}&select=id,password_hash`
  );

  // A wrong email and a wrong code answer identically. Anything else makes
  // this endpoint a way to test which addresses have accounts.
  if (!user) return json(res, 400, { error: "invalid_recovery_code" });

  const rows = await select(
    "uwufeed_recovery_codes",
    `user_id=eq.${user.id}&used_at=is.null&select=id,ciphertext`
  );

  const hit = match(rows, supplied);
  if (!hit) return json(res, 400, { error: "invalid_recovery_code" });

  // Spend it before issuing anything. If the update fails, no token was
  // handed out, which is the right way round to fail.
  const spent = await update(
    "uwufeed_recovery_codes",
    `id=eq.${hit.id}&used_at=is.null`,
    { used_at: new Date().toISOString() }
  );

  // A concurrent redemption of the same code got there first. The filter on
  // used_at is what makes single use hold under a race rather than by
  // checking and hoping.
  if (!Array.isArray(spent) || spent.length === 0) {
    return json(res, 400, { error: "invalid_recovery_code" });
  }

  const remaining = rows.length - 1;

  let token;
  try {
    token = issue(user.id, user.password_hash);
  } catch {
    return json(res, 503, { error: "link_token_secret_not_configured" });
  }

  return json(res, 200, { token, expires_in: TTL_SECONDS, remaining });
}
