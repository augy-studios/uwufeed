// Begin Discord sign in.
//
// Sets a random state in an HttpOnly cookie and sends the browser to
// Discord. The cookie is the thing that proves, on the way back, that this
// browser started the flow.

import { json, methodNotAllowed } from "../../_lib/http.js";
import {
  authorizeUrl,
  configured,
  issueState,
  stateCookie,
} from "../../_lib/discordoauth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!configured()) return json(res, 503, { error: "discord_oauth_not_configured" });

  const state = issueState();
  res.setHeader("set-cookie", stateCookie(state));
  res.writeHead(302, { location: authorizeUrl(state) });
  res.end();
}
