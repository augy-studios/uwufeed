// Delete the uwu_sessions row and clear the cookie.
//
// TODO Phase 4. Always answer 204, whether or not the session existed.

import { methodNotAllowed, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  return json(res, 501, { error: "not_implemented", phase: 4 });
}
