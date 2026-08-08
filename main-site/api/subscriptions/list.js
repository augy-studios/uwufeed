// Everything the signed in user follows, with its routing. Drives the
// sources panel and the OPML export.

import { select } from "../_lib/db.js";
import { json, methodNotAllowed } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";
import { resolveScope } from "../_lib/scope.js";
import { publicSource } from "../_lib/sources.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  // ?as=<space id> acts as a server or group this person manages.
  // The permission check lives in resolveScope, not here.
  const scope = await resolveScope(session, new URL(req.url, "http://localhost").searchParams.get("as"));
  if (scope.error) return json(res, 403, { error: scope.error });

  const rows = await select(
    "uwufeed_subscriptions",
    `user_id=eq.${scope.userId}` +
      "&select=id,created_at,added_via,origin_label," +
      "uwufeed_sources(id,platform,tier,feed_url,title," +
      "external_ref,retired_at,fail_count)," +
      "uwufeed_subscription_targets(target_id)" +
      "&order=created_at.desc"
  );

  const sources = rows
    .filter((row) => row.uwufeed_sources)
    .map((row) => {
      const routed = (row.uwufeed_subscription_targets || []).map((r) => Number(r.target_id));
      return {
        ...publicSource(row.uwufeed_sources),
        subscription_id: row.id,
        followed_at: row.created_at,
        // Enough for the panel to show health without exposing scheduling.
        failing: (row.uwufeed_sources.fail_count || 0) > 0,
        target_ids: routed,
        // Where this was added from. Null means it predates provenance
        // being recorded, which is different from having come from the web.
        added_via: row.added_via,
        origin_label: row.origin_label,
        // Empty routing means every destination, which is the default.
        routes_everywhere: routed.length === 0,
      };
    });

  return json(res, 200, { sources, count: sources.length, limit: 50 });
}
