// Servers and groups this person manages.
//
// A row here is access, never ownership. The space keeps its own account
// and its own sources; this is the list of dashboards somebody may open.
//
// Both platforms are checked live. Discord answers with MANAGE_GUILD on the
// guild list; Telegram answers with getChatMember, which returns creator or
// administrator for somebody who may manage a group or channel. Losing
// admin in either removes the entry on the next load.

import { select } from "./_lib/db.js";
import { json, methodNotAllowed } from "./_lib/http.js";
import { inviteUrl, fetchBotGuildIds } from "./_lib/discordoauth.js";
import { managedSpaces } from "./_lib/scope.js";
import { readSession } from "./_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const spaces = await managedSpaces(session.userId);

  // Which guilds the bot is actually in, so a server somebody administers
  // but has never invited the bot to can say so instead of being missing.
  // Null means the bot could not be asked, and then nothing is claimed.
  const botGuilds = await fetchBotGuildIds();

  const counts = await sourceCounts(spaces.map((s) => s.user_id));

  return json(res, 200, {
    spaces: spaces.map((space) => {
      // For Discord the bot's guild list answers this. For Telegram the
      // space could not have been recorded, nor its admins checked, without
      // the bot being in the chat, so its presence is implied.
      const present =
        space.platform !== "discord"
          ? true
          : botGuilds === null
            ? null
            : botGuilds.has(String(space.platform_id));

      return {
        id: space.id,
        platform: space.platform,
        label: space.label || (space.platform === "discord" ? "A server" : "A group"),
        sources: counts.get(space.user_id) || 0,
        // null means unknown rather than absent, and the interface has to
        // read it that way.
        bot_present: present,
        invite_url: present === false ? inviteUrl(space.platform_id) : null,
        // Both are rechecked on every load, so neither is a stale grant.
        access: "live",
      };
    }),
  });
}

// One query for every space, rather than one per space.
async function sourceCounts(userIds) {
  const counts = new Map();
  if (!userIds.length) return counts;

  const rows = await select(
    "uwufeed_subscriptions",
    `user_id=in.(${userIds.join(",")})&select=user_id`
  );
  for (const row of rows) {
    counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
  }
  return counts;
}
