// Direct messages to one person, sent from the site.
//
// This is not delivery. The dispatcher owns feed items, their rate limits
// and their deduplication, and it sends to targets, which can be shared
// spaces. This module only ever messages an individual, because the one
// thing it is used for is account recovery.
//
// A reset code in a group chat or a server channel is not a reset, it is a
// broadcast. So there is deliberately no function here that can post to
// one, and the ids these take come from uwufeed_users rather than from
// uwufeed_targets.

const TELEGRAM_API = "https://api.telegram.org";
const DISCORD_API = "https://discord.com/api/v10";

// Every function here returns whether it got through. A caller deciding
// what to try next needs to know, and nothing here should throw into an
// auth handler.

// A Telegram private chat has the same id as the user, so a DM needs no
// setup call. What it does need is the person having messaged the bot at
// least once: Telegram does not let a bot open a conversation, and returns
// a 403 rather than delivering.
export async function sendTelegramDm(telegramUserId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !telegramUserId) return false;

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: String(telegramUserId),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error(`telegram dm ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`telegram dm failed: ${err.message}`);
    return false;
  }
}

// Discord needs the DM channel opening first. It also refuses when the bot
// shares no guild with the person, or when they have direct messages from
// server members switched off, both as error 50007. Neither is detectable
// in advance, so the only correct handling is to try and fall through.
export async function sendDiscordDm(discordUserId, content) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !discordUserId) return false;

  const auth = { authorization: `Bot ${token}`, "content-type": "application/json" };

  try {
    const opened = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ recipient_id: String(discordUserId) }),
    });
    if (!opened.ok) {
      console.error(`discord dm open ${opened.status}: ${(await opened.text()).slice(0, 200)}`);
      return false;
    }

    const channel = await opened.json();
    if (!channel || !channel.id) return false;

    const sent = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!sent.ok) {
      console.error(`discord dm send ${sent.status}: ${(await sent.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`discord dm failed: ${err.message}`);
    return false;
  }
}
