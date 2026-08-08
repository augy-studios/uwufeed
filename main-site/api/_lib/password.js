// Password hashing with scrypt from node:crypto. No dependency, no build
// step, and memory hard enough to make a stolen hash expensive.

import crypto from "node:crypto";

// Cost parameters live inside the stored string, so they can be raised
// later without a migration and old hashes keep verifying.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("password_too_short");
  }
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt);
  return ["scrypt", N, R, P, salt.toString("base64"), derived.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  // A null hash is an account created by a bot, which has no password. It
  // must never match, and must not throw either.
  if (!stored || typeof password !== "string") return false;

  const parts = String(stored).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  let expected;
  try {
    expected = Buffer.from(hashB64, "base64");
    const derived = await scrypt(password, Buffer.from(saltB64, "base64"), {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      keylen: expected.length,
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function scrypt(password, salt, opts = {}) {
  const { N: n = N, r = R, p = P, keylen = KEY_LENGTH } = opts;
  return new Promise((resolve, reject) => {
    // maxmem has to be raised past the default for these parameters.
    crypto.scrypt(password, salt, keylen, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}
