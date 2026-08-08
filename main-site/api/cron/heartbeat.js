// Liveness check for the parts of the system that fail silently.
//
// Every check here is something that is wrong regardless of how busy the
// sources are. Nothing counts "quiet", because a quiet account and a broken
// pipeline look identical from the database, and an alert that cries wolf
// gets muted, which is worse than no alert.

import { rpc } from "../_lib/db.js";
import { json, methodNotAllowed } from "../_lib/http.js";
import { alert } from "../_lib/alert.js";
import { authorized } from "./renew-leases.js";

// What each count means, and what to do about it. Anything above its
// threshold gets reported.
const CHECKS = [
  {
    key: "lapsed_leases",
    threshold: 1,
    say: (n) =>
      `**${n}** push sources are past their lease and receiving nothing. ` +
      "Lease renewal runs nightly, so this should clear on its own. If it does not, that cron is failing.",
  },
  {
    key: "stuck_deliveries",
    threshold: 1,
    say: (n) =>
      `**${n}** deliveries have been pending for over an hour, which means a send ` +
      "started and never finished. The dispatcher probably died mid fan out.",
  },
  {
    key: "stalled_poll",
    threshold: 1,
    say: (n) =>
      `**${n}** polled sources are more than an hour past due. The poller is not running, ` +
      "or it cannot claim a batch.",
  },
  {
    key: "drifting_sources",
    threshold: 1,
    say: (n) =>
      `**${n}** sources are being fetched successfully but have published nothing in 30 days. ` +
      "Either they are genuinely dormant, or the feed is answering 200 with stale content.",
  },
  {
    key: "retired_recently",
    threshold: 1,
    say: (n) => `**${n}** sources were retired in the last day after repeated failures.`,
  },
];

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

  let health;
  try {
    const rows = await rpc("uwufeed_health", {});
    health = Array.isArray(rows) ? rows[0] : rows;
  } catch (err) {
    // The heartbeat failing is itself worth hearing about, since it is the
    // thing that would otherwise tell you.
    await alert("Heartbeat could not read the database", [`\`${err.message}\``]);
    return json(res, 500, { error: "health_query_failed", message: err.message });
  }

  if (!health) {
    await alert("Heartbeat got no health row back", ["uwufeed_health() returned nothing."]);
    return json(res, 500, { error: "no_health_row" });
  }

  const lines = [];
  for (const check of CHECKS) {
    const value = Number(health[check.key] || 0);
    if (value >= check.threshold) lines.push(check.say(value));
  }

  if (lines.length) {
    await alert("Something needs attention", lines);
  }

  return json(res, 200, { healthy: lines.length === 0, checks: health, reported: lines.length });
}
