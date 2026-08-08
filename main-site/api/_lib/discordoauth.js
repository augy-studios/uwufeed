// Discord OAuth2 and the guild list.
//
// Two scopes and nothing else: identify says who somebody is, guilds says
// which servers they are in and what they may do there. No email scope,
// because a Discord address is not something this project needs to hold.
//
// The access token is used during the callback and never stored. No refresh
// token is requested. The guild list is fetched live on the request that
// needs it, so a permission taken away in Discord is gone here on the next
// load rather than whenever a cached copy expires.

import crypto from "node:crypto";

const API = "https://discord.com/api/v10";
const AUTHORIZE = "https://discord.com/oauth2/authorize";
export const SCOPES = "identify guilds";

// Bit 0x20. Discord sends the permission set as a decimal string that
// overflows a double, so it has to be read as a BigInt.
const MANAGE_GUILD = 1n << 5n;

export const STATE_COOKIE = "uwufeed_oauth_state";
export const RETURN_COOKIE = "uwufeed_oauth_return";

export function configured() {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

export function redirectUri() {
  const base = process.env.PUBLIC_BASE_URL || "https://feed.uwuapps.org";
  return `${base.replace(/\/$/, "")}/api/auth/discord/callback`;
}

export function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    state,
    // Always show the consent screen. Silent reauthorisation is convenient
    // and makes it impossible to tell a fresh sign in from a redirect
    // somebody else started.
    prompt: "consent",
  });
  return `${AUTHORIZE}?${params.toString()}`;
}

// A random value in an HttpOnly cookie, echoed back through Discord. No
// signing needed: the cookie is the secret, and comparing the two is what
// proves this browser started the flow. Without it the callback would
// accept a code obtained anywhere, which is OAuth login CSRF.
export function issueState() {
  return crypto.randomBytes(32).toString("base64url");
}

export function stateMatches(cookieValue, returned) {
  if (typeof cookieValue !== "string" || typeof returned !== "string") return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(returned);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function stateCookie(value) {
  // Lax rather than Strict: the browser arrives here from discord.com, and
  // Strict would withhold the cookie on exactly that navigation.
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; Path=/api/auth/discord; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

export function clearStateCookie() {
  return `${STATE_COOKIE}=; Path=/api/auth/discord; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function exchangeCode(code) {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`discord token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function asUser(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`discord ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

export function fetchUser(token) {
  return asUser(token, "/users/@me");
}

// Every guild the person is in, filtered to the ones they may administer.
export async function fetchManagedGuilds(token) {
  const guilds = await asUser(token, "/users/@me/guilds");
  if (!Array.isArray(guilds)) return [];

  return guilds.filter((g) => {
    // The owner always counts, even though Discord also sets the bit.
    if (g.owner) return true;
    try {
      return (BigInt(g.permissions ?? "0") & MANAGE_GUILD) === MANAGE_GUILD;
    } catch {
      return false;
    }
  });
}

// The bot's own guild list, so the interface can tell "you administer this
// server and the bot is not in it" from "there is nothing here". Without
// the distinction an empty list looks like a bug.
export async function fetchBotGuildIds() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`${API}/users/@me/guilds`, {
      headers: { authorization: `Bot ${token}` },
    });
    if (!res.ok) return null;
    const guilds = await res.json();
    return Array.isArray(guilds) ? new Set(guilds.map((g) => String(g.id))) : null;
  } catch {
    // Not knowing is survivable. Not knowing and pretending is not, so the
    // caller gets null and says nothing rather than guessing.
    return null;
  }
}

export function inviteUrl(guildId) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    // Send Messages, Embed Links, Manage Webhooks. Matches SETUP.md.
    permissions: "537129472",
    guild_id: String(guildId),
  });
  return `${AUTHORIZE}?${params.toString()}`;
}

export function avatarUrl(user) {
  if (!user || !user.id) return null;
  if (!user.avatar) return null;
  const ext = String(user.avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
}
