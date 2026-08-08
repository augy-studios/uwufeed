// Register or remove a browser push subscription as a uwufeed_targets row.
//
// This endpoint only enrols. Sending is the dispatcher's job, in Python on
// the VPS, which is why no VAPID crypto happens here and why this function
// has no dependencies.

import { insertIgnoreDuplicates, remove, update } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed, noContent } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";

export default async function handler(req, res) {
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
  }

  // The site is static, so the public VAPID key has to be fetched rather
  // than baked into the HTML. It is public by definition: the browser
  // sends it to the push service.
  if (req.method === "GET") {
    return json(res, 200, { public_key: process.env.VAPID_PUBLIC_KEY || null });
  }

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const body = await readJsonBody(req);
  const subscription = body && body.subscription;
  if (!subscription || typeof subscription.endpoint !== "string") {
    return json(res, 400, { error: "subscription_required" });
  }

  // The endpoint alone identifies the browser. The keys travel with it,
  // and the whole object is what the sender needs.
  const targetRef = JSON.stringify({
    endpoint: subscription.endpoint,
    keys: subscription.keys || {},
  });

  if (req.method === "DELETE") {
    await remove(
      "uwufeed_targets",
      `user_id=eq.${session.userId}&channel=eq.webpush&target_ref=eq.${encodeURIComponent(targetRef)}`
    );
    return noContent(res);
  }

  const inserted = await insertIgnoreDuplicates(
    "uwufeed_targets",
    [{ user_id: session.userId, channel: "webpush", target_ref: targetRef }],
    ["user_id", "channel", "target_ref"]
  );

  // A browser re-subscribing with the same endpoint after the target was
  // deactivated by a 410 should come back on rather than stay dead.
  if (!Array.isArray(inserted) || !inserted.length) {
    await update(
      "uwufeed_targets",
      `user_id=eq.${session.userId}&channel=eq.webpush&target_ref=eq.${encodeURIComponent(targetRef)}`,
      { active: true }
    );
  }

  return json(res, 201, { registered: true });
}
