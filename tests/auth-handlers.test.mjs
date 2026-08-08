// reset, reset-confirm and password against a fake PostgREST, a fake
// Telegram and a fake Discord.
process.env.SUPABASE_URL = "https://fake.supabase.test";
process.env.SUPABASE_SERVICE_KEY = "service-key";
process.env.LINK_TOKEN_SECRET = "test-secret-value";
process.env.TELEGRAM_BOT_TOKEN = "12345:fake";
process.env.DISCORD_BOT_TOKEN = "discord-fake";

const base = new URL("../main-site/api/", import.meta.url).href;
const { hashPassword, verifyPassword } = await import(base + "_lib/password.js");
const { hashToken } = await import(base + "_lib/session.js");

let failed = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || extra === undefined ? "" : `  (${extra})`}`);
  if (!ok) failed += 1;
};

const world = { users: [], identities: [], sessions: [], sent: [] };
const fail = { telegram: false, discordOpen: false, discordSend: false };

const TABLES = {
  uwufeed_users: "users",
  uwufeed_identities: "identities",
  uwufeed_sessions: "sessions",
};

function matches(row, query) {
  for (const [key, value] of query.entries()) {
    if (["select", "limit", "order", "on_conflict"].includes(key)) continue;
    if (value.startsWith("eq.")) {
      if (String(row[key]) !== value.slice(3)) return false;
    } else if (value.startsWith("neq.")) {
      if (String(row[key]) === decodeURIComponent(value.slice(4))) return false;
    }
  }
  return true;
}

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = opts.method || "GET";

  if (u.hostname === "api.telegram.org") {
    if (fail.telegram) return { ok: false, status: 403, text: async () => "bot was blocked" };
    world.sent.push({ channel: "telegram", body: JSON.parse(opts.body) });
    return { ok: true, status: 200, text: async () => "{}" };
  }

  if (u.hostname === "discord.com") {
    if (u.pathname.endsWith("/users/@me/channels")) {
      if (fail.discordOpen) {
        return { ok: false, status: 403, text: async () => '{"code":50007}' };
      }
      return { ok: true, status: 200, json: async () => ({ id: "dm-channel-1" }) };
    }
    if (fail.discordSend) return { ok: false, status: 403, text: async () => "nope" };
    world.sent.push({ channel: "discord", body: JSON.parse(opts.body) });
    return { ok: true, status: 200, text: async () => "{}" };
  }

  const table = u.pathname.replace("/rest/v1/", "");
  const rows = world[TABLES[table]];
  const hit = rows.filter((r) => matches(r, u.searchParams));
  const respond = (body, headers = {}) => ({
    ok: true,
    status: 200,
    headers: { get: (k) => headers[k.toLowerCase()] || null },
    text: async () => JSON.stringify(body),
  });

  if (method === "GET") return respond(hit);
  if (method === "PATCH") {
    const patch = JSON.parse(opts.body);
    hit.forEach((r) => Object.assign(r, patch));
    return respond(hit);
  }
  if (method === "POST") {
    const added = JSON.parse(opts.body);
    added.forEach((r) => rows.push({ id: rows.length + 1, ...r }));
    return respond(added);
  }
  if (method === "DELETE") {
    const keep = rows.filter((r) => !hit.includes(r));
    const removed = rows.length - keep.length;
    rows.length = 0;
    keep.forEach((r) => rows.push(r));
    return respond(null, { "content-range": `*/${removed}` });
  }
  throw new Error(`unhandled ${method} ${url}`);
};

function makeRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.status = (n) => ((res.statusCode = n), res);
  res.setHeader = (k, v) => ((res.headers[k] = v), res);
  res.send = (raw) => ((res.body = JSON.parse(raw)), res);
  res.end = () => res;
  return res;
}

async function call(handler, { body = {}, method = "POST", cookie } = {}) {
  const req = { method, body, headers: cookie ? { cookie } : {} };
  const res = makeRes();
  await handler(req, res);
  return res;
}

const resetHandler = (await import(base + "auth/reset.js")).default;
const confirmHandler = (await import(base + "auth/reset-confirm.js")).default;
const passwordHandler = (await import(base + "auth/password.js")).default;

const UID = "3f8a1c22-9b4d-4e51-8a77-0c1d2e3f4a5b";

async function seed({ username, password = "original-password", identities = [] } = {}) {
  world.users.length = 0;
  world.identities.length = 0;
  world.sessions.length = 0;
  world.sent.length = 0;
  fail.telegram = fail.discordOpen = fail.discordSend = false;

  world.users.push({
    id: UID,
    email: "person@example.test",
    username,
    password_hash: await hashPassword(password),
  });
  identities.forEach((i, n) => world.identities.push({ id: n + 1, user_id: UID, ...i }));
  return UID;
}

const ask = () => call(resetHandler, { body: { email: "person@example.test" } });

// ---- a reset is always a direct message ----

await seed({ username: "augystudios", identities: [{ platform: "telegram", platform_user_id: "77001" }] });
let before = world.users[0].password_hash;
let res = await ask();
check("a Telegram identity gets a DM", res.body.delivered_to === "telegram", JSON.stringify(res.body));
check("the DM goes to the person, not a chat", world.sent[0].body.chat_id === "77001");
check("nothing changes until the code is used", world.users[0].password_hash === before);

const code = /<code>([^<]+)<\/code>/.exec(world.sent[0].body.text)[1];

await seed({ username: "augystudios", identities: [{ platform: "discord", platform_user_id: "88002" }] });
res = await ask();
check("a Discord identity gets a DM", res.body.delivered_to === "discord", JSON.stringify(res.body));
check("the Discord DM carries the code", /`[\w-]{40,}`/.test(world.sent[0].body.content));

await seed({
  username: "augystudios",
  identities: [
    { platform: "discord", platform_user_id: "88002" },
    { platform: "telegram", platform_user_id: "77001" },
  ],
});
res = await ask();
check("Telegram is preferred when both exist", res.body.delivered_to === "telegram");

// ---- falling through when a DM cannot be delivered ----

await seed({
  username: "augystudios",
  identities: [
    { platform: "telegram", platform_user_id: "77001" },
    { platform: "discord", platform_user_id: "88002" },
  ],
});
fail.telegram = true;
res = await ask();
check("a blocked Telegram bot falls through to Discord", res.body.delivered_to === "discord", JSON.stringify(res.body));

await seed({ username: "augystudios", identities: [{ platform: "discord", platform_user_id: "88002" }] });
fail.discordOpen = true;
before = world.users[0].password_hash;
res = await ask();
check("closed Discord DMs fall through to the username path", res.body.reset === true, JSON.stringify(res.body));
check("and that path did change the password", world.users[0].password_hash !== before);

// ---- no identity at all ----

await seed({ username: "augystudios" });
world.sessions.push({ id: 1, user_id: UID, token_hash: "old" });
res = await ask();
check("no identity resets to the username", res.body.password === "augystudios" && res.body.from_username === true);
check("the username now signs in", await verifyPassword("augystudios", world.users[0].password_hash));
check("existing sessions are ended", world.sessions.length === 0);

await seed({ username: "augy" });
res = await ask();
check("a short username falls back to a generated password", res.body.from_username === false && res.body.password.startsWith("uwu-"), res.body.password);
check("the generated password works", await verifyPassword(res.body.password, world.users[0].password_hash));

await seed({ username: null });
res = await ask();
check("a null username falls back too", res.body.from_username === false && typeof res.body.password === "string");

// ---- the switch ----

process.env.RESET_WITHOUT_CHAT = "off";
await seed({ username: "augystudios" });
before = world.users[0].password_hash;
res = await ask();
check("RESET_WITHOUT_CHAT=off refuses", res.statusCode === 409 && res.body.error === "no_chat_connected");
check("and changes nothing", world.users[0].password_hash === before);
delete process.env.RESET_WITHOUT_CHAT;

// ---- bad input ----

check("unknown email is a 404", (await call(resetHandler, { body: { email: "nobody@example.test" } })).statusCode === 404);
check("a non email is a 400", (await call(resetHandler, { body: { email: "augy" } })).body.error === "invalid_email");
check("GET is refused", (await call(resetHandler, { method: "GET" })).statusCode === 405);

// ---- confirming ----

await seed({ username: "augystudios", identities: [{ platform: "telegram", platform_user_id: "77001" }] });
res = await ask();
const liveCode = /<code>([^<]+)<\/code>/.exec(world.sent[0].body.text)[1];

res = await call(confirmHandler, { body: { token: liveCode, password: "a-brand-new-password" } });
check("confirming sets the password", res.statusCode === 200, JSON.stringify(res.body));
check("confirming signs the account in", String(res.headers["set-cookie"]).startsWith("uwufeed_session="));
check("the new password verifies", await verifyPassword("a-brand-new-password", world.users[0].password_hash));
check("replaying the same code fails", (await call(confirmHandler, { body: { token: liveCode, password: "third-password" } })).statusCode === 400);
check("a short new password is refused", (await call(confirmHandler, { body: { token: liveCode, password: "short" } })).body.error === "password_too_short");
check("a code from an earlier account is rejected", (await call(confirmHandler, { body: { token: code, password: "another-password" } })).statusCode === 400);

// ---- changing a known password ----

await seed({ username: "augystudios", password: "original-password" });
const live = "live-session-token";
world.sessions.push({ id: 1, user_id: UID, token_hash: hashToken(live), expires_at: "2099-01-01T00:00:00Z" });
world.sessions.push({ id: 2, user_id: UID, token_hash: "another-browser", expires_at: "2099-01-01T00:00:00Z" });
const cookie = `uwufeed_session=${live}`;

res = await call(passwordHandler, { body: { current_password: "wrong", new_password: "a-new-password" }, cookie });
check("the wrong current password is refused", res.statusCode === 403 && res.body.error === "current_password_wrong");

res = await call(passwordHandler, { body: { current_password: "original-password", new_password: "original-password" }, cookie });
check("an unchanged password is refused", res.body.error === "password_unchanged");

res = await call(passwordHandler, { body: { current_password: "original-password", new_password: "short" }, cookie });
check("a short new password is refused", res.body.error === "password_too_short");

res = await call(passwordHandler, { body: { current_password: "original-password", new_password: "a-new-password" }, cookie });
check("the right current password changes it", res.statusCode === 200 && res.body.changed === true, JSON.stringify(res.body));
check("one other session was ended", res.body.other_sessions_ended === 1, JSON.stringify(res.body));
check("this session survived", world.sessions.length === 1 && world.sessions[0].token_hash === hashToken(live));

check("no session is a 401", (await call(passwordHandler, { body: { current_password: "x", new_password: "y" } })).statusCode === 401);

await seed({ username: "chatuser" });
world.users[0].password_hash = null;
world.sessions.push({ id: 1, user_id: UID, token_hash: hashToken(live), expires_at: "2099-01-01T00:00:00Z" });
res = await call(passwordHandler, { body: { current_password: "", new_password: "a-new-password" }, cookie });
check("an account with no password says so", res.statusCode === 409 && res.body.error === "no_password_set");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
