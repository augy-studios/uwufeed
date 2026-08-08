// Liveness check for the parts of the system that fail silently.
//
// TODO Phase 7. Alert on: no item inserted in the last hour across all
// sources, a poller that has not claimed a batch recently, push sources
// whose lease already expired, deliveries stuck at status 'pending', and
// per source drift between published_at and fetched_at.

import { json, methodNotAllowed } from "../_lib/http.js";
import { authorized } from "./renew-leases.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
  return json(res, 501, { error: "not_implemented", cron: "heartbeat" });
}
