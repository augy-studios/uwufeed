// Delete the session row and clear the cookie.

import { methodNotAllowed, noContent } from "../_lib/http.js";
import { destroySession, clearCookieHeader } from "../_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    await destroySession(req);
  } catch (err) {
    // The cookie still gets cleared. A session row that outlives the
    // browser's copy expires on its own.
    console.error(`logout cleanup failed: ${err.message}`);
  }

  res.setHeader("set-cookie", clearCookieHeader());
  // Always 204, whether or not there was a session to end.
  return noContent(res);
}
