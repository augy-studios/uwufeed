// Register or remove a browser push subscription as a uwufeed_targets row.
//
// TODO Phase 4. POST stores the PushSubscription JSON as target_ref with
// channel 'webpush'. DELETE deactivates it. The dispatcher deactivates a
// target itself on a 410 from the push service, so this endpoint is only
// the enrolment half.

import { methodNotAllowed, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) return methodNotAllowed(res, ["POST", "DELETE"]);
  return json(res, 501, { error: "not_implemented", phase: 4 });
}
