// Passkeys in the browser. The server half is api/auth/passkey.js.
//
// Registration sends the public key from getPublicKey() rather than the
// attestation object, which is what lets the server verify assertions
// without a CBOR parser. A browser too old for getPublicKey() is treated as
// not supporting passkeys at all, since half the flow would not work.

const PUB_KEY_PARAMS = [
  { type: "public-key", alg: -7 }, // ES256, what almost everything uses
  { type: "public-key", alg: -257 }, // RS256, Windows Hello in places
  { type: "public-key", alg: -8 }, // Ed25519
];

export function passkeySupported() {
  return Boolean(
    window.PublicKeyCredential &&
      window.AuthenticatorAttestationResponse &&
      AuthenticatorAttestationResponse.prototype.getPublicKey
  );
}

// Whether this device can do biometrics or a screen lock. A security key on
// a keyring counts as a passkey but is not what the prompt offers, so the
// offer is only made when the device itself can do it.
export async function deviceCanVerify() {
  if (!passkeySupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function toBuffer(base64url) {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "===".slice((padded.length + 3) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function toBase64Url(buffer) {
  return toBase64(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// A label the person will recognise in a list months from now. The platform
// is the honest amount of detail available: the browser is not told which
// authenticator answered.
function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone or iPad";
  if (/Android/.test(ua)) return "Android device";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

export async function registerPasskey(options) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: toBuffer(options.challenge),
      rp: { id: options.rp_id, name: "uwuFeed" },
      user: {
        id: toBuffer(options.user_id),
        name: options.user_name,
        displayName: options.user_display_name,
      },
      pubKeyCredParams: PUB_KEY_PARAMS,
      authenticatorSelection: {
        // Discoverable, so signing in later needs no email typed first.
        residentKey: "preferred",
        // Biometrics or a screen lock, not a bare tap. The server insists
        // on this too, so asking for anything less would just fail later.
        userVerification: "required",
      },
      excludeCredentials: (options.exclude || []).map((id) => ({
        type: "public-key",
        id: toBuffer(id),
      })),
      timeout: options.timeout,
      attestation: "none",
    },
  });

  if (!credential) throw new Error("passkey_cancelled");

  const publicKey = credential.response.getPublicKey();
  if (!publicKey) throw new Error("passkey_unsupported");

  return {
    step: "register",
    challenge: options.challenge,
    proof: options.proof,
    credential_id: credential.id,
    public_key: toBase64(publicKey),
    client_data: toBase64Url(credential.response.clientDataJSON),
    authenticator_data: toBase64Url(credential.response.getAuthenticatorData()),
    label: deviceLabel(),
  };
}

export async function assertPasskey(options) {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: toBuffer(options.challenge),
      rpId: options.rp_id,
      userVerification: "preferred",
      timeout: options.timeout,
    },
  });

  if (!credential) throw new Error("passkey_cancelled");

  return {
    step: "login",
    challenge: options.challenge,
    proof: options.proof,
    credential_id: credential.id,
    client_data: toBase64Url(credential.response.clientDataJSON),
    authenticator_data: toBase64Url(credential.response.authenticatorData),
    signature: toBase64Url(credential.response.signature),
  };
}

// Cancelling a passkey prompt is a normal thing to do and must not be
// reported as a failure. The browser reports it as NotAllowedError, which
// it also uses for a timeout, and the two are not worth distinguishing.
export function wasCancelled(err) {
  return err && (err.name === "NotAllowedError" || err.message === "passkey_cancelled");
}
