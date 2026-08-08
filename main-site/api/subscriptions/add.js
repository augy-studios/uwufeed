// Follow a source as the signed in user.
//
// Resolution is shared with the admin endpoint, so the hub check has one
// implementation. What this adds is the account, the cap and the
// subscription row.

import { insertIgnoreDuplicates, count } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";
import { parseUrl, resolveAndStore, publicSource } from "../_lib/sources.js";

// The plan's starting cap. Easy to raise later and painful to introduce
// afterwards.
const MAX_SOURCES = 50;

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const body = await readJsonBody(req);
  if (!body || typeof body.url !== "string") return json(res, 400, { error: "url_required" });

  const parsed = parseUrl(body.url);
  if (parsed.error) return json(res, 400, { error: parsed.error });

  const following = await count("uwufeed_subscriptions", `user_id=eq.${session.userId}`);
  if (following >= MAX_SOURCES) {
    return json(res, 409, { error: "source_limit_reached", limit: MAX_SOURCES });
  }

  const result = await resolveAndStore(parsed.url);
  if (result.error) return json(res, 422, { error: result.error });

  const inserted = await insertIgnoreDuplicates(
    "uwufeed_subscriptions",
    [{ user_id: session.userId, source_id: result.source.id }],
    ["user_id", "source_id"]
  );
  const added = Array.isArray(inserted) && inserted.length > 0;

  return json(res, added ? 201 : 200, {
    source: publicSource(result.source),
    already_following: !added,
    following: following + (added ? 1 : 0),
    limit: MAX_SOURCES,
  });
}
