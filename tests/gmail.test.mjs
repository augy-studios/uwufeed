// _lib/gmail.js against a fake Google, plus the reset.js email branch.
import crypto from "node:crypto";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

process.env.SUPABASE_URL = "https://fake.supabase.test";
process.env.SUPABASE_SERVICE_KEY = "service-key";
process.env.LINK_TOKEN_SECRET = "test-secret-value";
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "uwufeed@project.iam.gserviceaccount.com";
process.env.GOOGLE_PRIVATE_KEY = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .replace(/\n/g, "\\n"); // as Vercel stores it
process.env.GMAIL_SENDER = "noreply@augystudios.com";
process.env.GMAIL_FROM_NAME = "uwuFeed";

const base = new URL("../main-site/api/", import.meta.url).href;

let failed = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || extra === undefined ? "" : `  (${extra})`}`);
  if (!ok) failed += 1;
};

const google = { tokenCalls: 0, sent: [], tokenStatus: 200, sendStatus: 200 };

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);

  if (u.hostname === "oauth2.googleapis.com") {
    google.tokenCalls += 1;
    google.lastAssertion = new URLSearchParams(opts.body).get("assertion");
    if (google.tokenStatus !== 200) {
      return { ok: false, status: google.tokenStatus, json: async () => ({ error: "unauthorized_client" }) };
    }
    return { ok: true, status: 200, json: async () => ({ access_token: "ya29.fake", expires_in: 3600 }) };
  }

  if (u.hostname === "gmail.googleapis.com") {
    google.sent.push({
      auth: opts.headers.authorization,
      raw: Buffer.from(JSON.parse(opts.body).raw, "base64url").toString("utf8"),
    });
    if (google.sendStatus !== 200) {
      return { ok: false, status: google.sendStatus, text: async () => "denied" };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  }

  // Minimal PostgREST for the reset handler.
  const table = u.pathname.replace("/rest/v1/", "");
  if (table === "uwufeed_users") {
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(world.users) };
  }
  if (table === "uwufeed_identities") {
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => "[]" };
  }
  return { ok: true, status: 200, headers: { get: () => "*/0" }, text: async () => "[]" };
};

const gmail = await import(base + "_lib/gmail.js");
const { hashPassword } = await import(base + "_lib/password.js");

// ---- configuration gate ----

check("reports configured when all three are set", gmail.configured() === true);

// ---- a real send ----

let ok = await gmail.sendMail({
  to: "person@example.test",
  subject: "Your uwuFeed password reset code",
  body: "line one\nline two",
});
check("sends successfully", ok === true);
check("minted one token", google.tokenCalls === 1);
check("used the bearer token", google.sent[0].auth === "Bearer ya29.fake");

const raw = google.sent[0].raw;
check("From carries the display name", raw.includes("From: uwuFeed <noreply@augystudios.com>"), raw.split("\r\n")[0]);
check("To is the recipient", raw.includes("To: person@example.test"));
check("Subject is present", raw.includes("Subject: Your uwuFeed password reset code"));
check("headers are CRLF separated", raw.includes("\r\n\r\n"));
check("body survives the round trip", Buffer.from(raw.split("\r\n\r\n")[1], "base64").toString("utf8") === "line one\nline two");

// ---- the JWT is a real RS256 assertion ----

const [h, c, s] = google.lastAssertion.split(".");
const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
const claims = JSON.parse(Buffer.from(c, "base64url").toString("utf8"));
check("header is RS256", header.alg === "RS256" && header.typ === "JWT");
check("issuer is the service account", claims.iss === "uwufeed@project.iam.gserviceaccount.com");
check("subject is the impersonated mailbox", claims.sub === "noreply@augystudios.com");
check("scope is gmail.send only", claims.scope === "https://www.googleapis.com/auth/gmail.send");
check("audience is the token endpoint", claims.aud === "https://oauth2.googleapis.com/token");
check("expiry is after issue", claims.exp > claims.iat);
check(
  "signature verifies against the key",
  crypto.createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"))
);

// ---- token caching ----

await gmail.sendMail({ to: "person@example.test", subject: "again", body: "x" });
check("a warm container reuses the token", google.tokenCalls === 1);

// ---- header injection ----

google.sent.length = 0;
const refused = await gmail.sendMail({
  to: "person@example.test\r\nBcc: attacker@evil.test",
  subject: "s",
  body: "body",
});
check("a recipient with a newline is refused outright", refused === false);
check("and nothing was sent", google.sent.length === 0);

// A subject is free text, so it folds rather than being refused. What it
// must never do is start a new header line.
google.sent.length = 0;
await gmail.sendMail({
  to: "person@example.test",
  subject: "hello\r\nX-Injected: yes",
  body: "body",
});
const headerLines = google.sent[0].raw.split("\r\n\r\n")[0].split("\r\n");
check(
  "a newline in the subject cannot start a header",
  !headerLines.some((line) => /^X-Injected:/i.test(line)),
  headerLines.join(" | ")
);
check("the subject text is folded onto one line", headerLines.some((l) => l === "Subject: hello X-Injected: yes"));

// ---- non ascii subject ----

google.sent.length = 0;
await gmail.sendMail({ to: "person@example.test", subject: "uwu ✿ feed", body: "body" });
check("a non ascii subject is encoded", /Subject: =\?UTF-8\?B\?/.test(google.sent[0].raw), google.sent[0].raw.split("\r\n")[2]);

// ---- failures are reported, not thrown ----

google.sendStatus = 403;
check("a rejected send returns false", (await gmail.sendMail({ to: "a@b.test", subject: "s", body: "b" })) === false);
google.sendStatus = 200;

gmail.resetTokenCache();
google.tokenStatus = 401;
check("a rejected token returns false", (await gmail.sendMail({ to: "a@b.test", subject: "s", body: "b" })) === false);
google.tokenStatus = 200;
gmail.resetTokenCache();

// ---- the reset.js branch ----

const world = { users: [] };
world.users.push({
  id: "3f8a1c22-9b4d-4e51-8a77-0c1d2e3f4a5b",
  email: "person@example.test",
  username: "augystudios",
  password_hash: await hashPassword("original-password"),
});

const resetHandler = (await import(base + "auth/reset.js")).default;
const makeRes = () => {
  const res = { statusCode: 0, headers: {}, body: null };
  res.status = (n) => ((res.statusCode = n), res);
  res.setHeader = (k, v) => ((res.headers[k] = v), res);
  res.send = (rawBody) => ((res.body = JSON.parse(rawBody)), res);
  return res;
};

google.sent.length = 0;
const before = world.users[0].password_hash;
let res = makeRes();
await resetHandler({ method: "POST", body: { email: "person@example.test" }, headers: {} }, res);

check("email is used when no chat is linked", res.body.delivered_to === "email", JSON.stringify(res.body));
check("the password is untouched", world.users[0].password_hash === before);
check("the username fallback did not fire", res.body.password === undefined);
check("a code reached the mailbox", google.sent[0].raw.includes("uwuFeed") && google.sent.length === 1);

const sentBody = Buffer.from(google.sent[0].raw.split("\r\n\r\n")[1], "base64").toString("utf8");
check("the mail explains what to do", sentBody.includes("Paste this into the app"));
check("the mail says it works once", sentBody.includes("works once"));

// With email switched off, the old fallback still applies.
delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
res = makeRes();
await resetHandler({ method: "POST", body: { email: "person@example.test" }, headers: {} }, res);
check("without email configured it falls back to the username", res.body.reset === true && res.body.password === "augystudios", JSON.stringify(res.body));

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
