// Email and password against uwufeed_users, session into uwufeed_sessions.

import { selectOne } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { verifyPassword } from "../_lib/password.js";
import { ensureSet } from "../_lib/recoverystore.js";
import { createSession, cookieHeader, normalizeEmail } from "../_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  const user = email
    ? await selectOne(
        "uwufeed_users",
        `email=eq.${encodeURIComponent(email)}&select=id,email,username,password_hash`
      )
    : null;

  // Always verify against something, so a missing account and a wrong
  // password take the same time and answer the same way. Otherwise this
  // endpoint is a user enumeration oracle.
  const ok = await verifyPassword(password, user ? user.password_hash : null);

  if (!user || !ok) return json(res, 401, { error: "invalid_credentials" });

  const { token, expiresAt } = await createSession(user.id);
  res.setHeader("set-cookie", cookieHeader(token, expiresAt));

  // An account created before recovery codes existed gets a set on its next
  // sign in, once, and is shown them here. Accounts that already have codes
  // are untouched, so this does not quietly invalidate a printed list.
  let recoveryCodes = null;
  try {
    recoveryCodes = await ensureSet(user.id);
  } catch (err) {
    console.error(`recovery codes not backfilled at sign in: ${err.message}`);
  }

  return json(res, 200, {
    user: { id: user.id, email: user.email, username: user.username },
    recovery_codes: recoveryCodes,
  });
}
