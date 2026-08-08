// Daily roll up for targets that opted out of instant delivery.
//
// TODO Phase 7. Gather items from the last 24 hours per target where the
// target's preference is digest, render one message, write one delivery
// row per item so the instant path never re-sends them.

import { json, methodNotAllowed } from "../_lib/http.js";
import { authorized } from "./renew-leases.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
  return json(res, 501, { error: "not_implemented", cron: "digest" });
}
