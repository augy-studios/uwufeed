// Register an ntfy topic as a uwufeed_targets row.
//
// No key management and no subscription lifecycle, which is the appeal. A
// topic either receives or it does not.

import crypto from "node:crypto";

import { insertIgnoreDuplicates, remove, update } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed, noContent } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";

// ntfy allows a wide range, but anything outside this is asking for
// trouble in a URL that gets copied around.
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export default async function handler(req, res) {
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
  }

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const base = (process.env.NTFY_BASE_URL || "https://ntfy.sh").replace(/\/+$/, "");

  // A suggested topic, so the safe path is the easy one.
  if (req.method === "GET") {
    return json(res, 200, { base_url: base, suggested_topic: generateTopic() });
  }

  const body = await readJsonBody(req);
  const topic = String((body && body.topic) || "").trim();
  if (!TOPIC_PATTERN.test(topic)) return json(res, 400, { error: "invalid_topic" });

  if (req.method === "DELETE") {
    await remove(
      "uwufeed_targets",
      `user_id=eq.${session.userId}&channel=eq.ntfy&target_ref=eq.${encodeURIComponent(topic)}`
    );
    return noContent(res);
  }

  const inserted = await insertIgnoreDuplicates(
    "uwufeed_targets",
    [{ user_id: session.userId, channel: "ntfy", target_ref: topic }],
    ["user_id", "channel", "target_ref"]
  );

  // Re-adding a topic that was deactivated should bring it back rather
  // than silently stay dead.
  if (!Array.isArray(inserted) || !inserted.length) {
    await update(
      "uwufeed_targets",
      `user_id=eq.${session.userId}&channel=eq.ntfy&target_ref=eq.${encodeURIComponent(topic)}`,
      { active: true }
    );
  }

  return json(res, 201, { topic, url: `${base}/${topic}` });
}

// A topic name is a shared secret in the shape of a URL: anyone who knows
// it can read it, and anyone who guesses it can too. Long and random by
// default, because a friendly name is a guessable one.
function generateTopic() {
  return `uwufeed-${crypto.randomBytes(12).toString("base64url")}`;
}
