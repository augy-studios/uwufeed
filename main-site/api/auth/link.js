// Issue a link token for the signed in user, plus the deep link that hands
// it to the Telegram bot in one tap.

import { json, methodNotAllowed } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";
import { issue, TTL_SECONDS } from "../_lib/linktoken.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  let token;
  try {
    token = issue(session.userId);
  } catch {
    return json(res, 503, { error: "link_token_secret_not_configured" });
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";

  return json(res, 200, {
    token,
    expires_in: TTL_SECONDS,
    // Telegram delivers the payload as an argument to /start, so tapping
    // this is the whole flow. Falls back to typing /link <token>.
    telegram_url: botUsername ? `https://t.me/${botUsername}?start=${token}` : null,
  });
}
