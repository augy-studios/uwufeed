// Create a uwu_users row and sign the new account in.
//
// TODO Phase 4. Hash with scrypt from node:crypto, no dependency needed.
//
// uwu_users is shared and already exists, so register against its actual
// shape. See db/shared-auth.md. Three things it requires:
//   - username is not null and unique, so the form has to collect one.
//   - email is plain text, not citext, so lowercase and trim it here or
//     the same person can create two accounts.
//   - username and email have separate unique constraints, so a duplicate
//     of each is a different error and deserves a different message.

import { methodNotAllowed, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  return json(res, 501, { error: "not_implemented", phase: 4 });
}
