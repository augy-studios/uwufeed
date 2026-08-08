// URL in, source out. The hub check decides the tier, and a source with a
// hub is never polled.
//
// Admin only. The browser goes through /api/subscriptions/add, which does
// the same resolution and also records who is following the result.

import { json, readJsonBody, methodNotAllowed, requireAdmin } from "../_lib/http.js";
import { parseUrl, resolveAndStore, publicSource } from "../_lib/sources.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!requireAdmin(req, res)) return;

  const body = await readJsonBody(req);
  if (!body || typeof body.url !== "string") return json(res, 400, { error: "url_required" });

  const parsed = parseUrl(body.url);
  if (parsed.error) return json(res, 400, { error: parsed.error });

  const result = await resolveAndStore(parsed.url, { subscribeToHub: body.subscribe !== false });
  if (result.error) return json(res, 422, result);

  return json(res, result.created ? 201 : 200, {
    source: publicSource(result.source),
    created: result.created,
    fetches: result.fetches,
    seeded_items: result.seeded,
    subscription: result.subscription,
  });
}
