// Public numbers for the home page.
//
// Counts only. No account data, nothing per user, nothing that identifies a
// source anybody follows. This is the one endpoint that answers without a
// session, so what it may say is worth being strict about.
//
// Cached for an hour at the edge. The numbers are for reassurance rather
// than monitoring, and an hourly count is cheap where a per request one
// would mean four aggregate queries against a growing table every time
// somebody loads a marketing page.

import { count, select } from "./_lib/db.js";
import { json, methodNotAllowed } from "./_lib/http.js";

const CACHE_SECONDS = 3600;

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    const [sources, accounts, items, pushShare] = await Promise.all([
      count("uwufeed_sources", "retired_at=is.null"),
      count("uwufeed_users", "id=not.is.null"),
      count("uwufeed_items", "id=not.is.null"),
      pushTierShare(),
    ]);

    res.setHeader(
      "cache-control",
      `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`
    );

    return json(res, 200, {
      sources,
      accounts,
      items,
      push_share: pushShare,
      // What the whole design is for, and the number nothing else in this
      // space publishes. Null until there is enough delivered to mean
      // anything, rather than a figure invented from three samples.
      median_push_latency_ms: await medianPushLatency(),
    });
  } catch (err) {
    console.error(`stats failed: ${err.message}`);
    // A marketing page must not break because a count did. Zeroes read as
    // "nothing yet", which is wrong but harmless, so null says "unknown".
    return json(res, 200, { sources: null, accounts: null, items: null });
  }
}

// The proportion of live sources on the push tier, which is the fraction
// that arrives in seconds rather than within the hour.
async function pushTierShare() {
  const [push, total] = await Promise.all([
    count("uwufeed_sources", "retired_at=is.null&tier=eq.push"),
    count("uwufeed_sources", "retired_at=is.null"),
  ]);
  if (!total) return null;
  return Math.round((push / total) * 100);
}

// Published time to delivered time, over recent push tier deliveries.
//
// Median rather than mean: one source with a wrong published_at, which is
// common in feeds, drags a mean anywhere it likes.
async function medianPushLatency() {
  const rows = await select(
    "uwufeed_deliveries",
    "select=sent_at,uwufeed_items!inner(published_at,uwufeed_sources!inner(tier))" +
      "&uwufeed_items.uwufeed_sources.tier=eq.push" +
      "&sent_at=not.is.null" +
      "&order=sent_at.desc&limit=200"
  );

  const deltas = rows
    .map((row) => {
      const item = row.uwufeed_items;
      if (!item || !item.published_at || !row.sent_at) return null;
      const ms = Date.parse(row.sent_at) - Date.parse(item.published_at);
      // A negative delta means a publisher dated a post in the future,
      // which happens. An implausibly large one means a backfill.
      return ms > 0 && ms < 30 * 60 * 1000 ? ms : null;
    })
    .filter((ms) => ms !== null)
    .sort((a, b) => a - b);

  if (deltas.length < 20) return null;
  return deltas[Math.floor(deltas.length / 2)];
}
