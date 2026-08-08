// Quiet hours and digest, per destination.
//
// These live on uwufeed_targets rather than in either bot's SQLite, because
// the dispatcher is the thing that has to honour them and it cannot read
// SQLite. That was the whole reason they sat unread for so long.

import { select, update } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const body = await readJsonBody(req);
  const targetId = body && body.target_id;
  if (!targetId) return json(res, 400, { error: "target_id_required" });

  const quietFrom = body.quiet_from || null;
  const quietTo = body.quiet_to || null;

  // Both or neither. One of the two is a half configured window that
  // behaves unpredictably at the boundary, and the database rejects it
  // anyway, so say so clearly rather than surfacing a constraint error.
  if (Boolean(quietFrom) !== Boolean(quietTo)) {
    return json(res, 400, { error: "quiet_hours_need_both" });
  }
  for (const value of [quietFrom, quietTo]) {
    if (value && !TIME.test(value)) return json(res, 400, { error: "invalid_time" });
  }

  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : null;
  if (timezone && !isKnownTimezone(timezone)) {
    return json(res, 400, { error: "invalid_timezone" });
  }

  // Ownership, before anything is written. Without this a target id would
  // be enough to silence somebody else's notifications.
  const owned = await select(
    "uwufeed_targets",
    `id=eq.${encodeURIComponent(targetId)}&user_id=eq.${session.userId}&select=id`
  );
  if (!owned.length) return json(res, 404, { error: "target_not_found" });

  const patch = {
    quiet_from: quietFrom,
    quiet_to: quietTo,
    digest: Boolean(body.digest),
  };
  if (timezone) patch.timezone = timezone;

  await update("uwufeed_targets", `id=eq.${encodeURIComponent(targetId)}`, patch);

  return json(res, 200, {
    target_id: Number(targetId),
    ...patch,
    // A digest with no quiet window has nothing to batch, since every item
    // is released immediately. Worth saying rather than silently doing
    // nothing.
    digest_effective: Boolean(body.digest) && Boolean(quietFrom),
  });
}

// An IANA name, validated by asking the runtime rather than shipping a list
// that goes stale. Offsets are not accepted: they are wrong twice a year.
function isKnownTimezone(name) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
