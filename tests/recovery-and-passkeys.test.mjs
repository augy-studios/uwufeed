// Recovery code crypto, and the WebAuthn verification helpers.
import crypto from "node:crypto";

process.env.LINK_TOKEN_SECRET = "test-secret-value";
process.env.PUBLIC_BASE_URL = "https://feed.uwuapps.org";

const base = new URL("../main-site/api/_lib/", import.meta.url).href;
const rc = await import(base + "recoverycodes.js");
const wa = await import(base + "webauthn.js");

let failed = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || extra === undefined ? "" : `  (${extra})`}`);
  if (!ok) failed += 1;
};

// ---- recovery codes ----

const codes = rc.generate();
check("generates ten codes", codes.length === 10);
check("all ten are distinct", new Set(codes).size === 10);
check("shaped for reading aloud", codes.every((c) => /^[a-z0-9]{5}-[a-z0-9]{5}$/.test(c)), codes[0]);
check("no ambiguous characters", codes.every((c) => !/[ilo01]/.test(c)), codes.join(" "));

const ct = rc.encrypt(codes[0]);
check("round trips through encryption", rc.decrypt(ct) === codes[0]);
check("ciphertext does not contain the code", !ct.includes(codes[0]));
check("encrypting twice gives different ciphertext", rc.encrypt(codes[0]) !== rc.encrypt(codes[0]));

// GCM must reject tampering rather than returning wrong plaintext.
const parts = ct.split(".");
const data = Buffer.from(parts[2], "base64");
data[0] ^= 0x01;
check(
  "a flipped ciphertext byte fails the auth tag",
  rc.decrypt([parts[0], parts[1], data.toString("base64")].join(".")) === null
);
check("malformed input returns null", rc.decrypt("nonsense") === null);
check("empty input returns null", rc.decrypt("") === null);

// A different secret must not read them.
process.env.LINK_TOKEN_SECRET = "a-different-secret";
check("another secret cannot decrypt", rc.decrypt(ct) === null);
process.env.LINK_TOKEN_SECRET = "test-secret-value";
check("the right secret still can", rc.decrypt(ct) === codes[0]);

// Typing tolerance.
check("accepts uppercase", rc.normalize("ABCDE-FGHIJ") === "abcdefghij");
check("accepts missing dashes", rc.normalize("abcdefghij") === "abcdefghij");
check("accepts stray spaces", rc.normalize("  abcde fghij ") === "abcdefghij");

const rows = codes.map((c, i) => ({ id: i + 1, ciphertext: rc.encrypt(c) }));
check("matches the right row", rc.match(rows, codes[3]).id === 4);
check("matches despite formatting", rc.match(rows, codes[3].toUpperCase().replace("-", " ")).id === 4);
check("rejects a code that is not there", rc.match(rows, "zzzzz-zzzzz") === null);
check("rejects a short code", rc.match(rows, "abc") === null);
check("rejects an empty code", rc.match(rows, "") === null);
check("an empty set matches nothing", rc.match([], codes[0]) === null);

// ---- webauthn: challenges ----

const reg = wa.issueChallenge("register");
check("a challenge verifies", wa.verifyChallenge(reg.challenge, reg.proof, "register") === true);
check(
  "a register challenge is not a login challenge",
  wa.verifyChallenge(reg.challenge, reg.proof, "login") === false
);
check("a wrong proof fails", wa.verifyChallenge(reg.challenge, "AAAAAAAAAAAAAAAAAAAAAA", "register") === false);
check("junk fails without throwing", wa.verifyChallenge("x", "y", "register") === false);

check("rp id comes from the base url", wa.rpId() === "feed.uwuapps.org");
check("origin comes from the base url", wa.expectedOrigin() === "https://feed.uwuapps.org");

// ---- webauthn: client data ----

const clientData = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

check(
  "accepts correct client data",
  wa.checkClientData(
    clientData({ type: "webauthn.create", challenge: reg.challenge, origin: "https://feed.uwuapps.org" }),
    { type: "webauthn.create", challenge: reg.challenge }
  ) === null
);
check(
  "rejects a get assertion offered as a create",
  wa.checkClientData(
    clientData({ type: "webauthn.get", challenge: reg.challenge, origin: "https://feed.uwuapps.org" }),
    { type: "webauthn.create", challenge: reg.challenge }
  ) === "wrong_ceremony_type"
);
check(
  "rejects a different challenge",
  wa.checkClientData(
    clientData({ type: "webauthn.create", challenge: wa.issueChallenge("register").challenge, origin: "https://feed.uwuapps.org" }),
    { type: "webauthn.create", challenge: reg.challenge }
  ) === "challenge_mismatch"
);
check(
  "rejects another site's origin",
  wa.checkClientData(
    clientData({ type: "webauthn.create", challenge: reg.challenge, origin: "https://evil.test" }),
    { type: "webauthn.create", challenge: reg.challenge }
  ) === "origin_mismatch"
);
check("rejects malformed client data", wa.checkClientData("!!!", { type: "webauthn.create", challenge: reg.challenge }) !== null);

// ---- webauthn: authenticator data ----

function authData({ rp = "feed.uwuapps.org", flags = 0x05, signCount = 1 } = {}) {
  const buf = Buffer.alloc(37);
  crypto.createHash("sha256").update(rp).digest().copy(buf, 0);
  buf.writeUInt8(flags, 32);
  buf.writeUInt32BE(signCount, 33);
  return buf.toString("base64url");
}

check("parses flags and counter", (() => {
  const d = wa.parseAuthenticatorData(authData({ signCount: 42 }));
  return d.userPresent && d.userVerified && d.signCount === 42;
})());
check("accepts good authenticator data", wa.checkAuthenticatorData(wa.parseAuthenticatorData(authData()), { requireUserVerified: true }) === null);
check(
  "rejects another site's rp id",
  wa.checkAuthenticatorData(wa.parseAuthenticatorData(authData({ rp: "evil.test" }))) === "rp_id_mismatch"
);
check(
  "rejects absent user presence",
  wa.checkAuthenticatorData(wa.parseAuthenticatorData(authData({ flags: 0x00 }))) === "user_not_present"
);
check(
  "rejects a tap when verification was required",
  wa.checkAuthenticatorData(wa.parseAuthenticatorData(authData({ flags: 0x01 })), { requireUserVerified: true }) ===
    "user_not_verified"
);
check("allows a tap when it was not required", wa.checkAuthenticatorData(wa.parseAuthenticatorData(authData({ flags: 0x01 }))) === null);
check("rejects truncated data", wa.checkAuthenticatorData(wa.parseAuthenticatorData("AAAA")) === "malformed_authenticator_data");

// ---- webauthn: signatures, against real keys ----

for (const [label, opts] of [
  ["ES256", { name: "ec", options: { namedCurve: "P-256" } }],
  ["Ed25519", { name: "ed25519", options: {} }],
  ["RS256", { name: "rsa", options: { modulusLength: 2048 } }],
]) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync(opts.name, opts.options);
  const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");

  const ad = authData({ signCount: 7 });
  const cd = clientData({ type: "webauthn.get", challenge: reg.challenge, origin: "https://feed.uwuapps.org" });
  const signed = Buffer.concat([
    Buffer.from(ad, "base64url"),
    crypto.createHash("sha256").update(Buffer.from(cd, "base64url")).digest(),
  ]);

  const sig = (opts.name === "ed25519"
    ? crypto.sign(null, signed, privateKey)
    : crypto.sign("sha256", signed, privateKey)
  ).toString("base64url");

  check(`${label} signature verifies`, wa.verifySignature({ publicKeySpki: spki, authenticatorData: ad, clientDataJSON: cd, signature: sig }));

  const bad = Buffer.from(sig, "base64url");
  bad[bad.length - 1] ^= 0x01;
  check(`${label} tampered signature is rejected`, !wa.verifySignature({ publicKeySpki: spki, authenticatorData: ad, clientDataJSON: cd, signature: bad.toString("base64url") }));

  check(
    `${label} signature over different data is rejected`,
    !wa.verifySignature({ publicKeySpki: spki, authenticatorData: authData({ signCount: 8 }), clientDataJSON: cd, signature: sig })
  );
}

check("a malformed public key is rejected", !wa.verifySignature({ publicKeySpki: "bm90YWtleQ==", authenticatorData: authData(), clientDataJSON: "e30", signature: "AA" }));

// ---- sign counter ----

check("a counter going backwards looks cloned", wa.signCountLooksCloned(10, 5) === true);
check("a repeated counter looks cloned", wa.signCountLooksCloned(10, 10) === true);
check("an advancing counter is fine", wa.signCountLooksCloned(10, 11) === false);
check("an authenticator that always reports zero is fine", wa.signCountLooksCloned(0, 0) === false);
check("zero is fine even after a real count", wa.signCountLooksCloned(10, 0) === false);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
