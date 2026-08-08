// Stop following a source.
//
// Deletes the subscription only. The uwufeed_sources row is shared and
// stays, because other people are probably following it.

import { remove } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";
import { resolveScope } from "../_lib/scope.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  // ?as=<space id> acts as a server or group this person manages.
  // The permission check lives in resolveScope, not here.
  const scope = await resolveScope(session, new URL(req.url, "http://localhost").searchParams.get("as"));
  if (scope.error) return json(res, 403, { error: scope.error });

  const body = await readJsonBody(req);
  const sourceId = body && body.source_id;
  if (!sourceId) return json(res, 400, { error: "source_id_required" });

  const deleted = await remove(
    "uwufeed_subscriptions",
    `user_id=eq.${scope.userId}&source_id=eq.${encodeURIComponent(sourceId)}`
  );

  return json(res, 200, { removed: deleted > 0 });
}
