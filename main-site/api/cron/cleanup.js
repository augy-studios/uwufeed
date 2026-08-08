// Retention. uwufeed_items growing without bound is a Phase 2 problem,
// not a later one.

import { remove } from "../_lib/db.js";
import { json, methodNotAllowed } from "../_lib/http.js";
import { authorized } from "./renew-leases.js";

// From the plan's starting caps. Easy to raise later and painful to
// introduce afterwards, which is why it is here from the start.
const ITEM_RETENTION_DAYS = 30;

function daysAgo(days) {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

  const cutoff = daysAgo(ITEM_RETENTION_DAYS);
  const result = { cutoff, items: 0, sessions: 0, errors: [] };

  // Deliveries carry on delete cascade from items, so they go with them
  // and never need their own pass.
  try {
    result.items = await remove("uwufeed_items", `fetched_at=lt.${encodeURIComponent(cutoff)}`);
  } catch (err) {
    result.errors.push(`items: ${err.message}`);
  }

  // uwu_sessions is shared with the rest of the uwu suite. This only
  // removes rows that already fail the expires_at > now() check, so it
  // logs nobody out, in any app.
  try {
    const now = new Date().toISOString();
    result.sessions = await remove("uwu_sessions", `expires_at=lt.${encodeURIComponent(now)}`);
  } catch (err) {
    result.errors.push(`sessions: ${err.message}`);
  }

  // Source retirement is not here. The poller retires a source the moment
  // it hits the failure limit, because it is the thing that saw the
  // failure and the thing that knows who to tell.

  return json(res, result.errors.length ? 207 : 200, result);
}
