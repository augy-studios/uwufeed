// Sending mail through the Google Workspace mailbox this project already
// has, rather than through a fourth party.
//
// The Gmail API is HTTPS and JSON, so it fits here. SMTP would not: an SMTP
// client means a dependency, and these functions have none.
//
// Auth is a service account with domain wide delegation. A service account
// has no mailbox of its own, so it impersonates a real Workspace user and
// the mail comes from that address. The access token is minted by signing a
// JWT with the service account key and exchanging it, which is
// crypto.createSign and one fetch.

import crypto from "node:crypto";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";

// Google issues these for an hour. Serverless containers are reused between
// invocations, so caching one saves a round trip on every warm request.
// Sixty seconds of slack covers clock drift against Google's clock.
let cached = null;

export function configured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GMAIL_SENDER
  );
}

function privateKey() {
  // Vercel stores multi line values with the newlines escaped, so a key
  // pasted into the dashboard arrives as one line of literal backslash n.
  return String(process.env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, "\n");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function assertion() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // Whose mailbox to act as. Domain wide delegation is what makes this
      // allowed, and it is granted per scope in the Admin console.
      sub: process.env.GMAIL_SENDER,
      scope: SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    })
  );

  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(privateKey())
    .toString("base64url");

  return `${header}.${claims}.${signature}`;
}

async function accessToken() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion: assertion() }).toString(),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload || !payload.access_token) {
    // The error body names the actual problem, which for this setup is
    // almost always the delegation not being granted for the scope.
    throw new Error(`google token ${res.status}: ${JSON.stringify(payload).slice(0, 200)}`);
  }

  cached = { token: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  return cached.token;
}

// A header value is one line by definition. Anything carrying a CR or an LF
// would end the header and begin whatever the caller wanted next, which is
// how a recipient address out of the database turns into extra headers.
//
// Folding to a space rather than deleting, so free text stays readable
// instead of having its words run together.
function headerSafe(value) {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

// An address is not free text, so folding it would leave a mangled To line
// that looks deliberate. Refuse instead. Registration only checks for an @,
// so this is the layer that has to care.
function usableAddress(value) {
  const address = String(value ?? "");
  return !/[\r\n]/.test(address) && address.includes("@") && address.length <= 320;
}

// RFC 2047, so a subject can hold anything without breaking the header.
function encodeSubject(subject) {
  const clean = headerSafe(subject);
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function mime({ to, subject, body }) {
  const from = process.env.GMAIL_FROM_NAME
    ? `${headerSafe(process.env.GMAIL_FROM_NAME)} <${headerSafe(process.env.GMAIL_SENDER)}>`
    : headerSafe(process.env.GMAIL_SENDER);

  return [
    `From: ${from}`,
    `To: ${headerSafe(to)}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64"),
  ].join("\r\n");
}

// Returns whether it got through, like the other notify paths. Nothing here
// should throw into an auth handler.
export async function sendMail({ to, subject, body }) {
  if (!configured()) return false;

  if (!usableAddress(to)) {
    console.error("gmail send refused: recipient is not a usable address");
    return false;
  }

  try {
    const res = await fetch(SEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw: base64url(mime({ to, subject, body })) }),
    });

    if (!res.ok) {
      console.error(`gmail send ${res.status}: ${(await res.text()).slice(0, 200)}`);
      // A rejected token is worth forgetting, so the next attempt mints a
      // fresh one rather than replaying a revoked one for an hour.
      if (res.status === 401) cached = null;
      return false;
    }
    return true;
  } catch (err) {
    console.error(`gmail send failed: ${err.message}`);
    return false;
  }
}

// Testing seam. The cache is module state, and a test that mints a token
// must not leak it into the next one.
export function resetTokenCache() {
  cached = null;
}
