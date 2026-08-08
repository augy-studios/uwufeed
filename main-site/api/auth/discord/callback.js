// Finish Discord sign in.
//
// Five outcomes, and being explicit about them matters because this is
// where account takeover bugs live:
//
//   identity exists, not signed in       sign in as that account
//   identity exists, same account        nothing to do
//   identity exists, different account   refuse
//   no identity, not signed in           create an account, origin discord
//   no identity, signed in               attach it to the signed in account
//
// The third is the dangerous one. The unique index on
// (platform, platform_user_id) in 0016 is what makes it an error rather
// than a silent transfer of somebody else's Discord account.

import { insert, selectOne, update } from "../../_lib/db.js";
import { methodNotAllowed } from "../../_lib/http.js";
import { ensureSet } from "../../_lib/recoverystore.js";
import {
  clearStateCookie,
  configured,
  exchangeCode,
  fetchUser,
  STATE_COOKIE,
  stateMatches,
} from "../../_lib/discordoauth.js";
import { createSession, cookieHeader, readCookie, readSession } from "../../_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!configured()) return fail(res, "discord_oauth_not_configured");

  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  // Somebody declining on Discord's consent screen is a normal outcome,
  // not an error to shout about.
  if (url.searchParams.get("error")) return done(res, "cancelled");
  if (!code) return fail(res, "no_code");

  if (!stateMatches(readCookie(req, STATE_COOKIE), returnedState)) {
    return fail(res, "bad_state");
  }

  // Whoever is already signed in, if anybody. This is what separates
  // attaching from signing in.
  const session = await readSession(req);

  let discordUser;
  try {
    const tokens = await exchangeCode(code);
    discordUser = await fetchUser(tokens.access_token);
  } catch (err) {
    console.error(`discord oauth failed: ${err.message}`);
    return fail(res, "discord_unavailable");
  }

  if (!discordUser || !discordUser.id) return fail(res, "discord_unavailable");

  const platformUserId = String(discordUser.id);
  const displayName = discordUser.global_name || discordUser.username || null;

  const existing = await selectOne(
    "uwufeed_identities",
    `platform=eq.discord&platform_user_id=eq.${encodeURIComponent(platformUserId)}&select=id,user_id`
  );

  // ---- identity already known ----
  if (existing) {
    if (session && session.userId !== existing.user_id) {
      // Attaching would either steal the identity from the other account or
      // leave two accounts claiming one person. Neither is acceptable, and
      // the database would refuse the write anyway.
      return fail(res, "discord_belongs_to_another_account");
    }

    await update("uwufeed_identities", `id=eq.${existing.id}`, {
      display_name: displayName,
      verified_via: "oauth",
    });

    if (session) return done(res, "already_linked");
    return signIn(res, existing.user_id, "signed_in");
  }

  // ---- signed in, so attach ----
  if (session) {
    await insert(
      "uwufeed_identities",
      [
        {
          user_id: session.userId,
          platform: "discord",
          platform_user_id: platformUserId,
          display_name: displayName,
          verified_via: "oauth",
        },
      ],
      { returning: false }
    );
    return done(res, "linked");
  }

  // ---- nobody signed in and nobody knows this person, so create ----
  //
  // No password, the way a bot created account has none. The check
  // constraint on uwufeed_users allows that for any origin except web.
  const rows = await insert("uwufeed_users", [
    { origin: "discord", display_name: displayName },
  ]);
  const user = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!user) return fail(res, "account_not_created");

  await insert(
    "uwufeed_identities",
    [
      {
        user_id: user.id,
        platform: "discord",
        platform_user_id: platformUserId,
        display_name: displayName,
        verified_via: "oauth",
      },
    ],
    { returning: false }
  );

  // A Discord account has no password and no email, so recovery codes are
  // the only way back in if the Discord account is ever lost.
  try {
    await ensureSet(user.id);
  } catch (err) {
    console.error(`recovery codes not issued for discord signup: ${err.message}`);
  }

  return signIn(res, user.id, "created");
}

async function signIn(res, userId, outcome) {
  const { token, expiresAt } = await createSession(userId);
  res.setHeader("set-cookie", [clearStateCookie(), cookieHeader(token, expiresAt)]);
  return redirect(res, outcome);
}

function done(res, outcome) {
  res.setHeader("set-cookie", clearStateCookie());
  return redirect(res, outcome);
}

function fail(res, reason) {
  res.setHeader("set-cookie", clearStateCookie());
  return redirect(res, `error:${reason}`);
}

// Back to the app with the outcome in the fragment. A fragment rather than
// a query string because it never reaches the server, so the outcome does
// not end up in an access log or a referrer.
function redirect(res, outcome) {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "") || "";
  const target = `${base}/#discord=${encodeURIComponent(outcome)}`;

  res.writeHead(302, { location: target });
  res.end();
}
