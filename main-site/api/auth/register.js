// Create a uwufeed_users row and sign the new account in.

import { insert } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { hashPassword } from "../_lib/password.js";
import { createSession, cookieHeader, normalizeEmail } from "../_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const username = body.username ? String(body.username).trim() : null;

  if (!email.includes("@") || email.length > 320) return json(res, 400, { error: "invalid_email" });
  if (password.length < 8) return json(res, 400, { error: "password_too_short" });
  if (username && !/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return json(res, 400, { error: "invalid_username" });
  }

  let passwordHash;
  try {
    passwordHash = await hashPassword(password);
  } catch {
    return json(res, 400, { error: "password_too_short" });
  }

  let user;
  try {
    // email and username are both citext and unique, so a duplicate is a
    // database error to catch rather than a select to run first. Checking
    // first loses the race between two simultaneous registrations.
    const rows = await insert("uwufeed_users", [
      { email, username, password_hash: passwordHash, origin: "web" },
    ]);
    user = Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (err) {
    const message = String(err.message || "");
    if (message.includes("uwufeed_users_email_key")) return json(res, 409, { error: "email_taken" });
    if (message.includes("uwufeed_users_username_key")) {
      return json(res, 409, { error: "username_taken" });
    }
    console.error(`register failed: ${message}`);
    return json(res, 500, { error: "register_failed" });
  }

  if (!user) return json(res, 500, { error: "register_failed" });

  const { token, expiresAt } = await createSession(user.id);
  res.setHeader("set-cookie", cookieHeader(token, expiresAt));

  return json(res, 201, {
    user: { id: user.id, email: user.email, username: user.username },
  });
}
