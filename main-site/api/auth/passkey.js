// Passkeys: one route, four steps, because Vercel routes by file and four
// files sharing this much setup would drift.
//
//   POST { step: "register-challenge" }  signed in, asks for a challenge
//   POST { step: "register" }            signed in, stores the credential
//   POST { step: "login-challenge" }     signed out, asks for a challenge
//   POST { step: "login" }               signed out, verifies and signs in
//
// Registration takes the public key from the browser's getPublicKey() as
// SPKI DER, which is what lets this verify assertions with node:crypto and
// no CBOR parser. See _lib/webauthn.js.

import { insert, select, selectOne, update } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { createSession, cookieHeader, readSession } from "../_lib/session.js";
import {
  CHALLENGE_TTL,
  checkAuthenticatorData,
  checkClientData,
  configured,
  issueChallenge,
  parseAuthenticatorData,
  rpId,
  signCountLooksCloned,
  verifyChallenge,
  verifySignature,
} from "../_lib/webauthn.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!configured()) return json(res, 503, { error: "link_token_secret_not_configured" });

  const body = await readJsonBody(req);
  if (!body) return json(res, 400, { error: "invalid_body" });

  switch (body.step) {
    case "register-challenge":
      return registerChallenge(req, res);
    case "register":
      return register(req, res, body);
    case "login-challenge":
      return loginChallenge(res);
    case "login":
      return login(res, body);
    default:
      return json(res, 400, { error: "unknown_step" });
  }
}

async function registerChallenge(req, res) {
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const user = await selectOne(
    "uwufeed_users",
    `id=eq.${session.userId}&select=id,email,username`
  );
  if (!user) return json(res, 401, { error: "not_signed_in" });

  // Credentials already registered, so the browser can refuse to make a
  // second one for the same authenticator instead of silently duplicating.
  const existing = await select(
    "uwufeed_passkeys",
    `user_id=eq.${session.userId}&select=credential_id`
  );

  const { challenge, proof } = issueChallenge("register");

  return json(res, 200, {
    challenge,
    proof,
    rp_id: rpId(),
    // The user handle. A uuid rather than an email, so the credential does
    // not carry an address around inside the authenticator forever.
    user_id: Buffer.from(user.id).toString("base64url"),
    user_name: user.email || user.username || "uwuFeed",
    user_display_name: user.username || user.email || "uwuFeed",
    exclude: existing.map((row) => row.credential_id),
    timeout: CHALLENGE_TTL * 1000,
  });
}

async function register(req, res, body) {
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  const { challenge, proof, credential_id: credentialId, public_key: publicKey } = body;

  if (!verifyChallenge(challenge, proof, "register")) {
    return json(res, 400, { error: "challenge_expired" });
  }

  const clientError = checkClientData(body.client_data, {
    type: "webauthn.create",
    challenge,
  });
  if (clientError) return json(res, 400, { error: clientError });

  const authData = parseAuthenticatorData(body.authenticator_data);
  // Registration insists on user verification. The entire offer is signing
  // in with biometrics or a screen lock, so a credential that cannot do it
  // is not the thing being offered.
  const authError = checkAuthenticatorData(authData, { requireUserVerified: true });
  if (authError) return json(res, 400, { error: authError });

  if (typeof credentialId !== "string" || typeof publicKey !== "string") {
    return json(res, 400, { error: "invalid_credential" });
  }

  try {
    await insert(
      "uwufeed_passkeys",
      [
        {
          user_id: session.userId,
          credential_id: credentialId,
          public_key: publicKey,
          sign_count: authData.signCount,
          label: typeof body.label === "string" ? body.label.slice(0, 60) : null,
        },
      ],
      { returning: false }
    );
  } catch (err) {
    if (String(err.message).includes("uwufeed_passkeys_credential_id_key")) {
      return json(res, 409, { error: "passkey_already_registered" });
    }
    throw err;
  }

  return json(res, 201, { registered: true });
}

function loginChallenge(res) {
  const { challenge, proof } = issueChallenge("login");

  // No credential list and no username. The authenticator already knows
  // which passkeys it holds for this site, and asking who is signing in
  // before they have proved anything is how a login form becomes an
  // account enumeration oracle.
  return json(res, 200, {
    challenge,
    proof,
    rp_id: rpId(),
    timeout: CHALLENGE_TTL * 1000,
  });
}

async function login(res, body) {
  const { challenge, proof, credential_id: credentialId } = body;

  if (!verifyChallenge(challenge, proof, "login")) {
    return json(res, 400, { error: "challenge_expired" });
  }

  const clientError = checkClientData(body.client_data, { type: "webauthn.get", challenge });
  if (clientError) return json(res, 400, { error: clientError });

  const authData = parseAuthenticatorData(body.authenticator_data);
  const authError = checkAuthenticatorData(authData);
  if (authError) return json(res, 400, { error: authError });

  const stored = await selectOne(
    "uwufeed_passkeys",
    `credential_id=eq.${encodeURIComponent(String(credentialId))}` +
      "&select=id,user_id,public_key,sign_count"
  );
  if (!stored) return json(res, 401, { error: "passkey_not_recognised" });

  const ok = verifySignature({
    publicKeySpki: stored.public_key,
    authenticatorData: body.authenticator_data,
    clientDataJSON: body.client_data,
    signature: body.signature,
  });
  if (!ok) return json(res, 401, { error: "passkey_not_recognised" });

  if (signCountLooksCloned(Number(stored.sign_count), authData.signCount)) {
    // Refusing is the conservative call: the alternative is signing in
    // whoever presented a credential that has apparently been copied.
    return json(res, 401, { error: "passkey_replay_suspected" });
  }

  const user = await selectOne(
    "uwufeed_users",
    `id=eq.${stored.user_id}&select=id,email,username`
  );
  if (!user) return json(res, 401, { error: "passkey_not_recognised" });

  await update("uwufeed_passkeys", `id=eq.${stored.id}`, {
    sign_count: authData.signCount,
    last_used_at: new Date().toISOString(),
  });

  const { token, expiresAt } = await createSession(user.id);
  res.setHeader("set-cookie", cookieHeader(token, expiresAt));

  return json(res, 200, {
    user: { id: user.id, email: user.email, username: user.username },
  });
}
