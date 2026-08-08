// Combining a person's own two accounts.
//
// GET previews, POST does it. Only ever between accounts one person is:
// their web account and a private Telegram chat account. A space is never a
// party to it, and the check below is what enforces that rather than a
// comment hoping nobody tries.
//
// Merge is one way. Once two subscription sets collapse, the rows that were
// duplicates are one row and nothing records that two accounts held it. An
// undo would mean keeping a shadow copy of the pre merge state, which is a
// second source of truth for feed data and not worth it here. So the
// interface says it cannot be undone, and this file makes sure that is the
// only surprising thing about it.

import { insertIgnoreDuplicates, remove, select, selectOne } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";

export default async function handler(req, res) {
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  if (req.method === "GET") {
    const from = new URL(req.url, "http://localhost").searchParams.get("from");
    return preview(res, session.userId, from);
  }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    if (!body) return json(res, 400, { error: "invalid_body" });
    return run(res, session.userId, body.from);
  }
  return methodNotAllowed(res, ["GET", "POST"]);
}

// The account being merged in has to be one this person owns, and must not
// be a space. Both checks, every time, on both the preview and the run.
async function resolveSource(userId, from) {
  const id = String(from ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "unknown_account" };
  if (id === userId) return { error: "cannot_merge_into_itself" };

  const source = await selectOne(
    "uwufeed_users",
    `id=eq.${id}&select=id,origin,display_name,email,password_hash`
  );
  if (!source) return { error: "unknown_account" };

  // A space has its own uwufeed_spaces row. If this account is one, it is
  // shared, and merging it would hand one member everybody else's feed.
  const space = await selectOne("uwufeed_spaces", `user_id=eq.${id}&select=id`);
  if (space) return { error: "cannot_merge_a_space" };

  // An account with credentials is somebody else's, not a chat account this
  // person happens to have. Refusing is the only safe reading.
  if (source.email || source.password_hash) return { error: "not_a_chat_account" };

  // The link between the two: this person's identity on that platform must
  // be the one the chat account belongs to.
  const identity = await selectOne(
    "uwufeed_identities",
    `user_id=eq.${userId}&platform=eq.${encodeURIComponent(source.origin)}&select=id`
  );
  if (!identity) return { error: "not_your_account" };

  return { source };
}

async function preview(res, userId, from) {
  const resolved = await resolveSource(userId, from);
  if (resolved.error) return json(res, 400, { error: resolved.error });

  const [mine, theirs] = await Promise.all([
    subscriptionMap(userId),
    subscriptionMap(resolved.source.id),
  ]);

  const both = [];
  const onlyMine = [];
  const onlyTheirs = [];

  for (const [sourceId, row] of mine) {
    (theirs.has(sourceId) ? both : onlyMine).push(row);
  }
  for (const [sourceId, row] of theirs) {
    if (!mine.has(sourceId)) onlyTheirs.push(row);
  }

  return json(res, 200, {
    from: {
      id: resolved.source.id,
      origin: resolved.source.origin,
      label: resolved.source.display_name,
    },
    // Duplicates are an exact key collision on source_id, because sources
    // are shared rows. There is no fuzzy matching to get wrong.
    in_both: both,
    only_here: onlyMine,
    only_there: onlyTheirs,
    total_after: both.length + onlyMine.length + onlyTheirs.length,
  });
}

async function subscriptionMap(userId) {
  const rows = await select(
    "uwufeed_subscriptions",
    `user_id=eq.${userId}&select=source_id,added_via,origin_label,uwufeed_sources!inner(title,feed_url)`
  );

  const map = new Map();
  for (const row of rows) {
    map.set(row.source_id, {
      source_id: row.source_id,
      title: (row.uwufeed_sources && row.uwufeed_sources.title) || null,
      feed_url: (row.uwufeed_sources && row.uwufeed_sources.feed_url) || null,
      added_via: row.added_via,
      origin_label: row.origin_label,
    });
  }
  return map;
}

async function run(res, userId, from) {
  const resolved = await resolveSource(userId, from);
  if (resolved.error) return json(res, 400, { error: resolved.error });

  const source = resolved.source;
  const label = source.display_name || null;

  // Copy then delete, rather than repointing user_id. The unique
  // constraints would reject any row the destination already has, and an
  // ignored duplicate is the right outcome there.
  const subs = await select(
    "uwufeed_subscriptions",
    `user_id=eq.${source.id}&select=source_id,added_via,origin_label`
  );

  let moved = 0;
  if (subs.length) {
    const inserted = await insertIgnoreDuplicates(
      "uwufeed_subscriptions",
      subs.map((row) => ({
        user_id: userId,
        source_id: row.source_id,
        // Keep whatever the row already said. Only fill it in when the row
        // predates provenance, and then say where it actually came from.
        added_via: row.added_via || source.origin,
        origin_label: row.origin_label || label,
      })),
      ["user_id", "source_id"]
    );
    moved = Array.isArray(inserted) ? inserted.length : 0;
  }

  const targets = await select(
    "uwufeed_targets",
    `user_id=eq.${source.id}&select=channel,target_ref,active,added_via,origin_label`
  );

  let movedTargets = 0;
  if (targets.length) {
    const inserted = await insertIgnoreDuplicates(
      "uwufeed_targets",
      targets.map((row) => ({
        user_id: userId,
        channel: row.channel,
        target_ref: row.target_ref,
        active: row.active,
        added_via: row.added_via || source.origin,
        origin_label: row.origin_label || label,
      })),
      ["user_id", "channel", "target_ref"]
    );
    movedTargets = Array.isArray(inserted) ? inserted.length : 0;
  }

  // Deleting the account cascades away whatever is left of it.
  await remove("uwufeed_users", `id=eq.${source.id}`);

  return json(res, 200, {
    merged: true,
    subscriptions_moved: moved,
    targets_moved: movedTargets,
  });
}
