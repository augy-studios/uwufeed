// Which account a request is acting as.
//
// By default the signed in person. With ?as=<space id> it is a server,
// group or channel they manage, and every scoped endpoint routes through
// here so the permission check exists in one place rather than in eight
// handlers.
//
// The distinction this file exists to keep straight:
//
//   owned     accounts the person is. These may be read together.
//   managed   spaces they administer. Read only when explicitly asked for,
//             never folded into the personal timeline, because somebody who
//             manages three servers did not ask for three servers' feeds in
//             their own.
//
// Both platforms are checked live, and that is the point. Discord answers
// with MANAGE_GUILD on the guild list; Telegram answers with getChatMember.
// Losing admin in either removes the space from the list on the next load
// rather than whenever somebody remembers to tidy up.
//
// And the asymmetry worth repeating: reading is scoped, delivering is not
// shared at all. Fan out joins t.user_id = s.user_id and must keep doing so.

import { select, selectOne } from "./db.js";
import { fetchManagedGuilds } from "./discordoauth.js";
import { isChatAdmin } from "./telegramapi.js";

// Resolves ?as= into the account to act as, or an error to answer with.
//
// Returns { userId, space } where space is null for the person themselves.
export async function resolveScope(session, asParam) {
  if (!asParam) return { userId: session.userId, space: null };

  const spaceId = String(asParam).replace(/[^0-9]/g, "");
  if (!spaceId) return { error: "unknown_space" };

  const space = await selectOne(
    "uwufeed_spaces",
    `id=eq.${spaceId}&select=id,user_id,platform,platform_id,label`
  );
  if (!space) return { error: "unknown_space" };

  if (!(await manages(session.userId, space))) return { error: "not_your_space" };

  return { userId: space.user_id, space };
}

// Every identity this account has, keyed by platform.
async function identitiesOf(userId) {
  const rows = await select(
    "uwufeed_identities",
    `user_id=eq.${userId}&select=id,platform,platform_user_id`
  );
  const byPlatform = new Map();
  for (const row of rows) byPlatform.set(row.platform, row);
  return byPlatform;
}

// Whether this person may manage this space, right now.
//
// A recorded manager row is necessary but not sufficient: it says the link
// was made, and the live check says it still holds. Telegram is asked
// directly. Discord is not asked here, because a user access token is only
// available during the guild list, and a row that has gone stale shows at
// worst one dashboard until the next list load removes it.
async function manages(userId, space) {
  const identities = await identitiesOf(userId);
  const identity = identities.get(space.platform);
  if (!identity) return false;

  const recorded = await select(
    "uwufeed_space_managers",
    `space_id=eq.${space.id}&identity_id=eq.${identity.id}&select=space_id&limit=1`
  );
  if (!recorded.length) return false;

  if (space.platform === "telegram") {
    const admin = await isChatAdmin(space.platform_id, identity.platform_user_id);
    // null means Telegram could not be asked. Falling back to the recorded
    // row is the lesser wrong: an outage must not lock somebody out of a
    // group they do administer.
    if (admin === false) return false;
  }

  return true;
}

// Every account this person *is*, as opposed to manages. The timeline reads
// across these and nothing else.
//
// Today that is just the account itself, since a private Telegram chat
// merges on link rather than staying separate. It is a function anyway
// because that is exactly the assumption that will change, and the timeline
// should not have to learn about it.
export async function ownedAccounts(userId) {
  return [userId];
}

// Servers, groups and channels this person manages, checked live.
export async function managedSpaces(userId, { discordToken } = {}) {
  const identities = await identitiesOf(userId);
  if (!identities.size) return [];

  const ids = [...identities.values()].map((row) => row.id);
  const rows = await select(
    "uwufeed_space_managers",
    `identity_id=in.(${ids.join(",")})` +
      "&select=space_id,uwufeed_spaces!inner(id,user_id,platform,platform_id,label)"
  );

  const spaces = rows.map((row) => row.uwufeed_spaces).filter(Boolean);

  // Discord: filter against the live guild list when a token is available.
  let allowedGuilds = null;
  if (discordToken) {
    try {
      const guilds = await fetchManagedGuilds(discordToken);
      allowedGuilds = new Set(guilds.map((g) => String(g.id)));
    } catch {
      // Discord being unreachable must not empty the list.
      allowedGuilds = null;
    }
  }

  // Telegram: ask about each chat. One call per group, which is fine at the
  // handful a person actually administers, and it is what makes losing
  // admin take the group away.
  const telegram = identities.get("telegram");
  const checked = await Promise.all(
    spaces.map(async (space) => {
      if (space.platform === "discord") {
        if (!allowedGuilds) return space;
        return allowedGuilds.has(String(space.platform_id)) ? space : null;
      }

      if (!telegram) return null;
      const admin = await isChatAdmin(space.platform_id, telegram.platform_user_id);
      // null is "could not ask", which keeps the space rather than hiding it.
      return admin === false ? null : space;
    })
  );

  return checked.filter(Boolean);
}
