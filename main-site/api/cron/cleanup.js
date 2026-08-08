// Retention prune. uwufeed_items growing without bound is a Phase 2
// problem, not a later one.
//
// TODO Phase 2. Delete items older than 30 days, delete deliveries that
// cascade with them, delete expired uwu_sessions rows, and retire sources
// past 20 consecutive failures, telling their subscribers rather than
// going quiet.

import { json, methodNotAllowed } from "../_lib/http.js";
import { authorized } from "./renew-leases.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
  return json(res, 501, { error: "not_implemented", cron: "cleanup" });
}
