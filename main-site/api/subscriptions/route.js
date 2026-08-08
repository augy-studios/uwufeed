// Choose which destinations a followed source goes to.
//
// An empty list means every destination, which is the default and what a
// subscription starts as. A non empty list means only those.

import { select, remove, insertIgnoreDuplicates, selectOne } from "../_lib/db.js";
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
  const targetIds = Array.isArray(body && body.target_ids) ? body.target_ids : null;
  if (!sourceId || !targetIds) return json(res, 400, { error: "source_id_and_target_ids_required" });

  // The subscription has to be this user's. Without this check a source id
  // plus a target id would let anyone reroute someone else's feed.
  const subscription = await selectOne(
    "uwufeed_subscriptions",
    `user_id=eq.${scope.userId}&source_id=eq.${encodeURIComponent(sourceId)}&select=id`
  );
  if (!subscription) return json(res, 404, { error: "not_following_that_source" });

  // Same for the targets. Only ids this account owns are accepted, so an
  // unknown or borrowed one is dropped rather than silently honoured.
  const owned = await select(
    "uwufeed_targets",
    `user_id=eq.${scope.userId}&select=id`
  );
  const ownedIds = new Set(owned.map((row) => Number(row.id)));
  const wanted = targetIds.map(Number).filter((id) => ownedIds.has(id));

  await remove(
    "uwufeed_subscription_targets",
    `subscription_id=eq.${subscription.id}`
  );

  if (wanted.length) {
    await insertIgnoreDuplicates(
      "uwufeed_subscription_targets",
      wanted.map((id) => ({ subscription_id: subscription.id, target_id: id })),
      ["subscription_id", "target_id"]
    );
  }

  return json(res, 200, {
    source_id: Number(sourceId),
    target_ids: wanted,
    // Saying this back explicitly, because "no destinations" and "every
    // destination" are the same stored state and the difference matters.
    routes_everywhere: wanted.length === 0,
  });
}
