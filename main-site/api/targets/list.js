// Every destination this account owns, so the client can offer them as
// routing choices.

import { select } from "../_lib/db.js";
import { json, methodNotAllowed } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";

const LABELS = {
  telegram: "Telegram chat",
  discord: "Discord channel",
  webpush: "This browser",
  ntfy: "ntfy topic",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const rows = await select(
    "uwufeed_targets",
    `user_id=eq.${session.userId}&select=id,channel,target_ref,active,created_at` +
      "&order=created_at.asc"
  );

  return json(res, 200, {
    targets: rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      label: LABELS[row.channel] || row.channel,
      // Never return the raw reference. A webhook URL is a credential and
      // a chat id is not useful to the browser.
      hint: describe(row.channel, row.target_ref),
      active: row.active,
    })),
  });
}

function describe(channel, ref) {
  if (channel === "webpush") {
    try {
      return new URL(JSON.parse(ref).endpoint).hostname;
    } catch {
      return "browser";
    }
  }
  if (channel === "discord") {
    // Webhook URLs end in a long secret. The id before it is enough to
    // tell two webhooks apart without printing either secret.
    const match = /\/webhooks\/(\d+)/.exec(String(ref));
    return match ? `webhook ${match[1].slice(-6)}` : "webhook";
  }
  if (channel === "telegram") return `chat ${String(ref).slice(-6)}`;
  return String(ref).slice(0, 24);
}
