// The timeline: items from the sources the signed in user subscribes to.
//
// TODO Phase 4. Read the session, join uwufeed_subscriptions to
// uwufeed_items, order by published_at desc with a keyset cursor rather
// than an offset, cap the page at 50 to match what the service worker
// precaches.

import { methodNotAllowed, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  return json(res, 501, { error: "not_implemented", phase: 4 });
}
