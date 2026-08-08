// Send hub.mode=subscribe for a source that already exists. resolve.js
// calls this path for new sources; this endpoint is for retries and for
// the renewal cron.

import { selectOne, update } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed, requireAdmin } from "../_lib/http.js";
import { requestHubSubscription, newSourceSecret } from "../_lib/websub.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!requireAdmin(req, res)) return;

  const body = await readJsonBody(req);
  const sourceId = body && body.source_id;
  if (!sourceId) return json(res, 400, { error: "source_id_required" });

  const source = await selectOne(
    "uwufeed_sources",
    `id=eq.${encodeURIComponent(sourceId)}&select=*`
  );
  if (!source) return json(res, 404, { error: "source_not_found" });
  if (source.tier !== "push" || !source.hub_url) {
    return json(res, 409, { error: "source_is_not_push_tier" });
  }

  let secret = source.websub_secret;
  if (!secret) {
    secret = newSourceSecret();
    await update("uwufeed_sources", `id=eq.${source.id}`, { websub_secret: secret });
  }

  const result = await requestHubSubscription({ ...source, websub_secret: secret }, "subscribe");

  // The hub answers 202 and verifies out of band, so lease_expires_at is
  // written by the GET handler, not here.
  if (!result.ok) {
    await update("uwufeed_sources", `id=eq.${source.id}`, {
      fail_count: (source.fail_count || 0) + 1,
    });
    return json(res, 502, { error: "hub_rejected", ...result });
  }

  return json(res, 202, { source_id: source.id, hub_url: source.hub_url, ...result });
}
