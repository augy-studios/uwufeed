// Start a password reset for somebody who cannot sign in.
//
// Every path here is private to one person. Order of preference:
//
// 1. A Telegram DM, if they linked Telegram.
// 2. A Discord DM, if they linked Discord.
// 3. Email, through the Workspace mailbox in _lib/gmail.js.
// 4. None of those, in which case the password is set to the account's
//    username and returned in the response.
//
// What this deliberately never does is send to uwufeed_targets. A target is
// where feed items are delivered, and it can be a shared space: a Telegram
// group, or a Discord webhook pointing into a channel the whole server
// reads. A reset code in a shared space is not a reset, it is a broadcast.
// So recovery reads uwufeed_identities instead, which answers who somebody
// is on a platform rather than where their items go.
//
// Step 4 is a deliberate product decision and it is worth being blunt about
// what it costs. This endpoint is unauthenticated by nature, so anybody who
// knows an email address can take that path and be handed working
// credentials for an account with nowhere private to send a code.
// Configuring email closes it for every web account, since registration
// requires an address. RESET_WITHOUT_CHAT=off refuses instead, which turns
// a forgotten password into a dead account rather than an open one.

import crypto from "node:crypto";

import { select, selectOne, update, remove } from "../_lib/db.js";
import { configured as mailConfigured, sendMail } from "../_lib/gmail.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { sendTelegramDm, sendDiscordDm } from "../_lib/notify.js";
import { hashPassword } from "../_lib/password.js";
import { issue, TTL_SECONDS } from "../_lib/resettoken.js";
import { normalizeEmail } from "../_lib/session.js";

// hashPassword refuses anything shorter, so a three character username
// cannot become a password even though it is a valid username.
const MIN_PASSWORD = 8;

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  const email = normalizeEmail(body.email);
  if (!email.includes("@")) return json(res, 400, { error: "invalid_email" });

  const user = await selectOne(
    "uwufeed_users",
    `email=eq.${encodeURIComponent(email)}&select=id,email,username,password_hash`
  );
  if (!user) return json(res, 404, { error: "account_not_found" });

  const identities = await select(
    "uwufeed_identities",
    `user_id=eq.${user.id}&select=platform,platform_user_id`
  );

  let token;
  try {
    token = issue(user.id, user.password_hash);
  } catch {
    return json(res, 503, { error: "link_token_secret_not_configured" });
  }

  const minutes = Math.round(TTL_SECONDS / 60);

  // Each of these can fail for reasons only the far end knows: DMs closed,
  // the bot never messaged, mail rejected. So this is a fall through rather
  // than a choice made up front.
  for (const route of routes(user, identities, token, minutes)) {
    if (await route.send()) {
      return json(res, 200, {
        delivered_to: route.name,
        hint: route.hint,
        expires_in: TTL_SECONDS,
      });
    }
  }

  return resetToUsername(res, user);
}

function routes(user, identities, token, minutes) {
  const available = [];
  const on = (platform) => identities.find((row) => row.platform === platform);

  const telegram = on("telegram");
  if (telegram) {
    available.push({
      name: "telegram",
      hint: "your Telegram chat with the bot",
      send: () => sendTelegramDm(telegram.platform_user_id, telegramText(token, minutes)),
    });
  }

  const discord = on("discord");
  if (discord) {
    available.push({
      name: "discord",
      hint: "a direct message from the bot",
      send: () => sendDiscordDm(discord.platform_user_id, discordText(token, minutes)),
    });
  }

  if (user.email && mailConfigured()) {
    available.push({
      name: "email",
      hint: user.email,
      send: () =>
        sendMail({
          to: user.email,
          subject: "Your uwuFeed password reset code",
          body: emailText(token, minutes),
        }),
    });
  }

  return available;
}

async function resetToUsername(res, user) {
  if (String(process.env.RESET_WITHOUT_CHAT || "on").toLowerCase() === "off") {
    return json(res, 409, { error: "no_chat_connected" });
  }

  // The username is the intended new password. It is not always usable as
  // one, so anything too short or missing falls back to something generated
  // rather than being padded into a password nobody can predict but the
  // user cannot guess either.
  const fromUsername = typeof user.username === "string" && user.username.length >= MIN_PASSWORD;
  const password = fromUsername ? user.username : generatePassword();

  const hash = await hashPassword(password);
  await update("uwufeed_users", `id=eq.${user.id}`, { password_hash: hash });

  // Whoever asked for this reset is not necessarily the person holding the
  // open sessions, so every existing one goes.
  await remove("uwufeed_sessions", `user_id=eq.${user.id}`);

  return json(res, 200, {
    reset: true,
    password,
    from_username: fromUsername,
  });
}

// Readable rather than maximally dense, because this gets typed by hand
// from a phone screen at least some of the time.
function generatePassword() {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return `uwu-${out.slice(0, 6)}-${out.slice(6, 12)}`;
}

function telegramText(token, minutes) {
  return (
    "<b>Password reset</b>\n\n" +
    "Paste this into the app on the sign in screen:\n\n" +
    `<code>${token}</code>\n\n` +
    `It lasts ${minutes} minutes and works once. ` +
    "If you did not ask for this, ignore it. Nothing has changed yet."
  );
}

function discordText(token, minutes) {
  return (
    "**Password reset**\n\n" +
    "Paste this into the app on the sign in screen:\n\n" +
    `\`${token}\`\n\n` +
    `It lasts ${minutes} minutes and works once. ` +
    "If you did not ask for this, ignore it. Nothing has changed yet."
  );
}

// Plain text, no HTML part. There is nothing here that formatting helps
// with, and a single part message is one less thing to get wrong.
function emailText(token, minutes) {
  return [
    "Somebody asked to reset the password on your uwuFeed account.",
    "",
    "Paste this into the app on the sign in screen:",
    "",
    `    ${token}`,
    "",
    `It lasts ${minutes} minutes and works once.`,
    "",
    "If you did not ask for this, ignore this message. Nothing has changed",
    "and your password still works.",
  ].join("\n");
}
