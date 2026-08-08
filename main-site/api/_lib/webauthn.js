// WebAuthn verification, with no dependency and no CBOR parser.
//
// The usual reason a passkey library is needed is the attestation object,
// which is CBOR and holds the credential public key. This avoids it: the
// browser exposes the same key as SPKI DER through getPublicKey(), so the
// client sends that and node:crypto imports it directly. Everything else
// WebAuthn needs is either JSON or a fixed binary layout.
//
// Supported since Chrome 85, Safari 16 and Firefox 119. A browser without
// it cannot register a passkey here and falls back to a password, which is
// the correct outcome for something offered as an upgrade.

import crypto from "node:crypto";

const CHALLENGE_BYTES = 32;
const CHALLENGE_TTL_SECONDS = 300;
const LABEL = "uwufeed/webauthn-challenge/v1";

// authenticatorData layout: rpIdHash(32) flags(1) signCount(4) then, on
// registration only, attested credential data.
const RP_ID_HASH_BYTES = 32;
const FLAGS_OFFSET = 32;
const SIGN_COUNT_OFFSET = 33;
const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;

function secret() {
  const value = process.env.LINK_TOKEN_SECRET;
  if (!value) throw new Error("link_token_secret_not_configured");
  return value;
}

export function configured() {
  return Boolean(process.env.LINK_TOKEN_SECRET);
}

// The relying party id is the domain, without scheme or port. It has to
// match the origin the browser reports, and getting it wrong is the single
// most common reason a passkey silently refuses to work.
export function rpId() {
  const base = process.env.PUBLIC_BASE_URL || "https://feed.uwuapps.org";
  try {
    return new URL(base).hostname;
  } catch {
    return "localhost";
  }
}

export function expectedOrigin() {
  const base = process.env.PUBLIC_BASE_URL || "https://feed.uwuapps.org";
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
}

// Challenges are signed rather than stored, like every other token here, so
// there is no table and no sweep. The purpose is bound in, so a
// registration challenge cannot be replayed as an authentication one.
export function issueChallenge(purpose) {
  const nonce = crypto.randomBytes(CHALLENGE_BYTES - 8);
  const expiry = Buffer.alloc(8);
  expiry.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS));

  const payload = Buffer.concat([expiry, nonce]);
  const mac = crypto
    .createHmac("sha256", secret())
    .update(LABEL)
    .update(String(purpose))
    .update(payload)
    .digest()
    .subarray(0, 16);

  return { challenge: payload.toString("base64url"), proof: mac.toString("base64url") };
}

export function verifyChallenge(challenge, proof, purpose) {
  let payload;
  let supplied;
  try {
    payload = Buffer.from(String(challenge), "base64url");
    supplied = Buffer.from(String(proof), "base64url");
  } catch {
    return false;
  }
  if (payload.length !== CHALLENGE_BYTES || supplied.length !== 16) return false;

  const expected = crypto
    .createHmac("sha256", secret())
    .update(LABEL)
    .update(String(purpose))
    .update(payload)
    .digest()
    .subarray(0, 16);

  if (!crypto.timingSafeEqual(supplied, expected)) return false;
  return payload.readBigUInt64BE(0) >= BigInt(Math.floor(Date.now() / 1000));
}

// The browser's clientDataJSON, checked against what we asked for.
export function checkClientData(clientDataJSON, { type, challenge }) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(String(clientDataJSON), "base64url").toString("utf8"));
  } catch {
    return "malformed_client_data";
  }

  if (parsed.type !== type) return "wrong_ceremony_type";

  // Compare base64url to base64url. The browser echoes the challenge back
  // exactly as it was given.
  if (typeof parsed.challenge !== "string") return "missing_challenge";
  const echoed = Buffer.from(parsed.challenge, "base64url");
  const asked = Buffer.from(String(challenge), "base64url");
  if (echoed.length !== asked.length || !crypto.timingSafeEqual(echoed, asked)) {
    return "challenge_mismatch";
  }

  // Without this, a credential created on any site could be replayed here.
  if (parsed.origin !== expectedOrigin()) return "origin_mismatch";

  return null;
}

export function parseAuthenticatorData(base64url) {
  const raw = Buffer.from(String(base64url), "base64url");
  if (raw.length < SIGN_COUNT_OFFSET + 4) return null;

  const flags = raw.readUInt8(FLAGS_OFFSET);
  return {
    raw,
    rpIdHash: raw.subarray(0, RP_ID_HASH_BYTES),
    userPresent: Boolean(flags & FLAG_USER_PRESENT),
    userVerified: Boolean(flags & FLAG_USER_VERIFIED),
    signCount: raw.readUInt32BE(SIGN_COUNT_OFFSET),
  };
}

export function checkAuthenticatorData(data, { requireUserVerified = false } = {}) {
  if (!data) return "malformed_authenticator_data";

  const expected = crypto.createHash("sha256").update(rpId()).digest();
  if (!crypto.timingSafeEqual(data.rpIdHash, expected)) return "rp_id_mismatch";

  // User presence means somebody physically interacted. It is the minimum,
  // and an assertion without it is not evidence of anything.
  if (!data.userPresent) return "user_not_present";

  // User verification means biometrics or a screen lock, rather than a
  // mere tap. Required at registration, since the whole offer is signing in
  // with a fingerprint or a PIN.
  if (requireUserVerified && !data.userVerified) return "user_not_verified";

  return null;
}

// The signature covers authenticatorData followed by the hash of
// clientDataJSON. Never the other way round, and never the raw JSON.
export function verifySignature({ publicKeySpki, authenticatorData, clientDataJSON, signature }) {
  let key;
  try {
    key = crypto.createPublicKey({
      key: Buffer.from(publicKeySpki, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    return false;
  }

  const signed = Buffer.concat([
    Buffer.from(String(authenticatorData), "base64url"),
    crypto.createHash("sha256").update(Buffer.from(String(clientDataJSON), "base64url")).digest(),
  ]);

  const sig = Buffer.from(String(signature), "base64url");

  try {
    // Ed25519 takes a null algorithm. ECDSA and RSA take the digest name,
    // and WebAuthn's ECDSA signatures are DER encoded, which is what
    // node verifies by default.
    if (key.asymmetricKeyType === "ed25519") return crypto.verify(null, signed, key, sig);
    return crypto.verify("sha256", signed, key, sig);
  } catch {
    return false;
  }
}

// A counter that fails to increase means the credential may have been
// cloned. Plenty of passkeys report zero forever, and treating that as an
// attack would lock out most of the people this feature is for.
export function signCountLooksCloned(stored, reported) {
  if (reported === 0) return false;
  return reported <= stored;
}

export const CHALLENGE_TTL = CHALLENGE_TTL_SECONDS;
