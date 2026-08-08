// Register an ntfy topic as a uwufeed_targets row.
//
// TODO Phase 6. target_ref is the topic name, channel is 'ntfy'. No key
// management and no subscription lifecycle, which is the whole appeal.
// Validate the topic against the server's own rules before storing, and
// warn that a guessable topic name is readable by anyone.

import { methodNotAllowed, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) return methodNotAllowed(res, ["POST", "DELETE"]);
  return json(res, 501, { error: "not_implemented", phase: 6 });
}
