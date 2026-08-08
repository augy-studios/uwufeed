// Issuing and reading a set of recovery codes. Split from recoverycodes.js
// so the crypto has no database in it and can be tested on its own.

import { insert, remove, select } from "./db.js";
import { CODE_COUNT, decrypt, encrypt, generate } from "./recoverycodes.js";

// Replaces whatever the account had. Returns the plaintext codes, which is
// the only time they exist outside the database in that form on this path.
export async function issueSet(userId, count = CODE_COUNT) {
  const codes = generate(count);

  // Delete first: a set is all or nothing, and leaving old rows behind
  // would mean an account quietly accumulating working codes it was never
  // shown.
  await remove("uwufeed_recovery_codes", `user_id=eq.${userId}`);
  await insert(
    "uwufeed_recovery_codes",
    codes.map((code, i) => ({
      user_id: userId,
      position: i + 1,
      ciphertext: encrypt(code),
    })),
    { returning: false }
  );

  return codes;
}

export async function unusedRows(userId) {
  return select(
    "uwufeed_recovery_codes",
    `user_id=eq.${userId}&used_at=is.null&select=id,position,ciphertext&order=position.asc`
  );
}

export async function countUnused(userId) {
  return (await unusedRows(userId)).length;
}

// Every code, used or not, in display order. Used ones are reported rather
// than hidden, so somebody comparing against a printed list can see which
// have gone.
export async function readSet(userId) {
  const rows = await select(
    "uwufeed_recovery_codes",
    `user_id=eq.${userId}&select=position,ciphertext,used_at&order=position.asc`
  );

  return rows.map((row) => ({
    position: row.position,
    code: decrypt(row.ciphertext),
    used: Boolean(row.used_at),
  }));
}

// Issues a set only if the account has none at all. Used on sign in, so an
// account created before recovery codes existed gets one without being
// asked, and an account that has already spent nine keeps its last one.
export async function ensureSet(userId) {
  const existing = await select(
    "uwufeed_recovery_codes",
    `user_id=eq.${userId}&select=id&limit=1`
  );
  if (existing.length) return null;
  return issueSet(userId);
}
