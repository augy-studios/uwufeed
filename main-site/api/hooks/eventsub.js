// Twitch EventSub receiver, stream.online.
//
// TODO Phase 5. Shape of the work:
//   - Twitch-Eventsub-Message-Type: webhook_callback_verification returns
//     the raw challenge, notification handles the event, revocation
//     retires the source.
//   - Signature is HMAC SHA256 over (message id + timestamp + raw body)
//     using the secret registered with the subscription, in
//     Twitch-Eventsub-Message-Signature.
//   - Reject a timestamp older than 10 minutes, replay protection.
//   - Offline grace period, so a stream flickering does not fire repeat
//     live alerts. Hold a stream.offline for a few minutes before acting.
//   - Items land as kind 'stream' with external_id set to the Twitch
//     stream id, never the broadcaster id, or a restart looks like the
//     same stream.

import { methodNotAllowed, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  return json(res, 501, { error: "not_implemented", phase: 5 });
}
