// Daily, non-negotiable. WebSub leases cap at ten days, so anything
// expiring within three days gets resubscribed tonight.
//
// TODO Phase 1 follow up. This is the single highest consequence stub in
// the repo: skip it and the push tier goes silent after a week and a half
// with nothing logging an error anywhere.
//
// Shape of the work:
//   select * from uwufeed_sources
//    where tier = 'push' and retired_at is null
//      and (lease_expires_at is null or lease_expires_at < now() + interval '3 days')
//   then POST hub.mode=subscribe for each, spaced out, and count failures.
//   Alert if the renewed count is zero on a day with push sources.

import { json, methodNotAllowed, timingSafeEqualString } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
  return json(res, 501, { error: "not_implemented", cron: "renew-leases" });
}

// Vercel sends Authorization: Bearer $CRON_SECRET on scheduled invocations.
export function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization || "";
  return timingSafeEqualString(header.startsWith("Bearer ") ? header.slice(7) : "", secret);
}
