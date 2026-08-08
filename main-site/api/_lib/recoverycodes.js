// Ten single use codes per account, the way back in that does not depend
// on reaching anybody.
//
// Every other recovery path assumes a channel still works: a Telegram DM, a
// Discord DM, an inbox. Codes assume nothing. They are what covers losing
// the linked account itself, which is the case none of the others can.
//
// Encrypted rather than hashed, because the Account page shows them again.
// See the migration for the trade that makes. The key is derived from
// LINK_TOKEN_SECRET rather than being its own variable, for the same reason
// the reset token shares it: a second secret is a second thing to leave
// unset, and an unset one breaks recovery silently.

import crypto from "node:crypto";

const COUNT = 10;
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

// Ambiguous characters left out. These get copied off a screen, written
// down, and typed back months later.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUP = 5;

function key() {
  const secret = process.env.LINK_TOKEN_SECRET;
  if (!secret) throw new Error("link_token_secret_not_configured");
  // Distinct info string, so this key and the reset token's MAC key are
  // unrelated even though they come from the same secret.
  return crypto.hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.from("uwufeed/recovery-codes/salt"),
    Buffer.from("uwufeed/recovery-codes/v1"),
    32
  );
}

export function configured() {
  return Boolean(process.env.LINK_TOKEN_SECRET);
}

function randomCode() {
  const bytes = crypto.randomBytes(GROUP * 2);
  let out = "";
  for (let i = 0; i < GROUP * 2; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, GROUP)}-${out.slice(GROUP)}`;
}

export function generate(count = COUNT) {
  return Array.from({ length: count }, randomCode);
}

// Typed by hand, so accept the shapes a person actually produces: pasted
// with spaces, capitalised by a phone keyboard, dashes missing.
export function normalize(code) {
  return String(code ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function encrypt(code) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key()), iv);
  const data = Buffer.concat([cipher.update(String(code), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

// Returns null rather than throwing on anything malformed, so one bad row
// cannot take down the whole Account page.
export function decrypt(stored) {
  try {
    const [ivB64, tagB64, dataB64] = String(stored).split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key()), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// Which stored row a supplied code matches, or null. Every candidate is
// compared even after a match is found, so the work done does not reveal
// which position the code was in.
export function match(rows, supplied) {
  const wanted = normalize(supplied);
  if (wanted.length < GROUP * 2) return null;

  let found = null;
  for (const row of rows) {
    const plain = decrypt(row.ciphertext);
    if (plain === null) continue;
    const candidate = normalize(plain);
    if (candidate.length !== wanted.length) continue;
    if (
      crypto.timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(wanted, "utf8")) &&
      found === null
    ) {
      found = row;
    }
  }
  return found;
}

export const CODE_COUNT = COUNT;
