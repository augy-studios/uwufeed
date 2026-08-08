// Round trip and negative cases for the reset code, plus the guarantee
// that a link token and a reset code are not interchangeable.
process.env.LINK_TOKEN_SECRET = "test-secret-value";

const base = new URL("../main-site/api/_lib/", import.meta.url).href;
const reset = await import(base + "resettoken.js");
const link = await import(base + "linktoken.js");
const { hashPassword } = await import(base + "password.js");

let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
};

const uid = "3f8a1c22-9b4d-4e51-8a77-0c1d2e3f4a5b";
const hashA = await hashPassword("original-password");
const hashB = await hashPassword("changed-password");

const token = reset.issue(uid, hashA);

check("round trips to the same user id", reset.verify(token, hashA) === uid);
check("code is 42 characters", token.length === 42);
check("unverifiedUserId reads the id out", reset.unverifiedUserId(token) === uid);

// The single use property: the hash it was signed against is gone.
check("stops verifying once the password changed", reset.verify(token, hashB) === null);
check("null hash does not verify a real code", reset.verify(token, null) === null);

// A bot account has a null hash, so a code must still be issuable for one
// and must still be bound to that state.
const nullToken = reset.issue(uid, null);
check("issues against a null hash", reset.verify(nullToken, null) === uid);
check("null hash code rejected once a password exists", reset.verify(nullToken, hashA) === null);

// Tampering.
const bytes = Buffer.from(token, "base64url");
bytes[20] ^= 0x01;
check("rejects a flipped expiry byte", reset.verify(bytes.toString("base64url"), hashA) === null);
const short = Buffer.from(token, "base64url").subarray(0, 30).toString("base64url");
check("rejects a truncated code", reset.verify(short, hashA) === null);
check("rejects junk without throwing", reset.verify("not a code at all", hashA) === null);
check("rejects an empty code", reset.verify("", hashA) === null);
check("unverifiedUserId returns null for junk", reset.unverifiedUserId("zzzz") === null);

// Domain separation. Both are signed with LINK_TOKEN_SECRET, so this is
// the only thing stopping one being replayed as the other.
const linkToken = link.issue(uid);
check("a link token is not a valid reset code", reset.verify(linkToken, hashA) === null);
check("a reset code is not a valid link token", link.verify(token) === null);

// Expiry.
const expired = reset.issue(uid, hashA, -1);
check("rejects an expired code", reset.verify(expired, hashA) === null);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
