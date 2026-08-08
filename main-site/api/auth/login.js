// Email and password against uwu_users, session into uwu_sessions.
//
// TODO Phase 4. Verify with scrypt from node:crypto, compare in constant
// time, create a session, set the HttpOnly cookie from _lib/session.js.
// Same generic error for unknown email and wrong password, so the endpoint
// is not a user enumeration oracle.
//
// Normalize the email the same way register.js does, with
// session.normalizeEmail. The column is plain text rather than citext, so
// normalising on only one of the two paths makes an account unreachable by
// the address that created it. See db/shared-auth.md.

import { methodNotAllowed, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  return json(res, 501, { error: "not_implemented", phase: 4 });
}
