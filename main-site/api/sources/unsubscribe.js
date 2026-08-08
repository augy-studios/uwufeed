// Send hub.mode=unsubscribe and stop the push tier for a source.
// Retiring the source row itself is separate, because other users may
// still be subscribed to it.

import { selectOne, update } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed, requireAdmin } from "../_lib/http.js";
import { requestHubSubscription } from "../_lib/websub.js";

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
  if (!source.hub_url) return json(res, 409, { error: "source_has_no_hub" });

  const result = await requestHubSubscription(source, "unsubscribe");
  await update("uwufeed_sources", `id=eq.${source.id}`, { lease_expires_at: null });

  return json(res, result.ok ? 202 : 502, { source_id: source.id, ...result });
}
