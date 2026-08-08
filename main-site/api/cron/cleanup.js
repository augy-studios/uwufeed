// Retention and tidying. uwufeed_items growing without bound is a problem
// to solve now, not a later one.

import { remove, select, update } from "../_lib/db.js";
import { json, methodNotAllowed } from "../_lib/http.js";
import { authorized } from "./renew-leases.js";

// From the plan's starting caps. Easy to raise later and painful to
// introduce afterwards, which is why it is here from the start.
const ITEM_RETENTION_DAYS = 30;

// A destination deactivated this long ago is not coming back. Deactivation
// happens on a permanent failure, so the browser or chat is gone.
const DEAD_TARGET_DAYS = 90;

// A source demoted after hub failures gets one chance to come back. Slow on
// purpose: re-checking a broken hub nightly is a nightly wasted request.
const PROMOTION_CHECK_DAYS = 30;

function daysAgo(days) {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

  const result = { items: 0, sessions: 0, dead_targets: 0, promotion_candidates: 0, errors: [] };

  // Deliveries carry on delete cascade from items, so they go with them and
  // never need their own pass.
  try {
    const cutoff = daysAgo(ITEM_RETENTION_DAYS);
    result.items = await remove("uwufeed_items", `fetched_at=lt.${encodeURIComponent(cutoff)}`);
  } catch (err) {
    result.errors.push(`items: ${err.message}`);
  }

  // Only removes rows that already fail the expires_at > now() check, so it
  // logs nobody out. uwufeed_sessions has an index on expires_at, so this is
  // not a sequential scan.
  try {
    const now = new Date().toISOString();
    result.sessions = await remove("uwufeed_sessions", `expires_at=lt.${encodeURIComponent(now)}`);
  } catch (err) {
    result.errors.push(`sessions: ${err.message}`);
  }

  // A dead browser subscription from two years ago is harmless and it is
  // still a row, and it still shows up as a routing choice.
  try {
    const cutoff = daysAgo(DEAD_TARGET_DAYS);
    result.dead_targets = await remove(
      "uwufeed_targets",
      `active=is.false&created_at=lt.${encodeURIComponent(cutoff)}`
    );
  } catch (err) {
    result.errors.push(`dead targets: ${err.message}`);
  }

  // A source demoted to the poll tier after its hub kept rejecting us never
  // returns on its own, even once the hub is fixed. Clearing hub_url makes
  // the next resolve of that feed re-detect it.
  try {
    result.promotion_candidates = await markForRecheck();
  } catch (err) {
    result.errors.push(`promotion: ${err.message}`);
  }

  return json(res, result.errors.length ? 207 : 200, result);
}

// Poll tier sources that still remember a hub, untouched for a month. The
// hub is forgotten so the next resolution looks again, which is the only
// path back to the push tier.
async function markForRecheck() {
  const cutoff = daysAgo(PROMOTION_CHECK_DAYS);
  const candidates = await select(
    "uwufeed_sources",
    `tier=eq.poll&retired_at=is.null&hub_url=not.is.null` +
      `&created_at=lt.${encodeURIComponent(cutoff)}&select=id&limit=100`
  );

  for (const source of candidates) {
    await update("uwufeed_sources", `id=eq.${source.id}`, { hub_url: null });
  }
  return candidates.length;
}
