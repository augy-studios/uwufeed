// The timeline: items from the sources the signed in user follows.

import { select } from "../_lib/db.js";
import { json, methodNotAllowed } from "../_lib/http.js";
import { readSession } from "../_lib/session.js";
import { resolveScope } from "../_lib/scope.js";

// Matches what the service worker precaches.
const PAGE_SIZE = 50;

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "not_signed_in" });

  // ?as=<space id> acts as a server or group this person manages.
  // The permission check lives in resolveScope, not here.
  const scope = await resolveScope(session, new URL(req.url, "http://localhost").searchParams.get("as"));
  if (scope.error) return json(res, 403, { error: scope.error });

  const subs = await select(
    "uwufeed_subscriptions",
    `user_id=eq.${scope.userId}&select=source_id`
  );
  if (!subs.length) return json(res, 200, { items: [], cursor: null });

  const sourceIds = subs.map((row) => row.source_id);
  const cursor = parseCursor(new URL(req.url, "http://localhost").searchParams.get("cursor"));

  // Keyset rather than offset. An offset over a table that grows at the
  // head re-reads rows the client already has, and shifts them under it
  // while paging.
  const filters = [
    `source_id=in.(${sourceIds.join(",")})`,
    "select=id,source_id,external_id,title,url,author,summary,thumbnail_url,published_at,kind," +
      "uwufeed_sources(title,platform)",
    "order=published_at.desc.nullslast,id.desc",
    `limit=${PAGE_SIZE}`,
  ];

  if (cursor) {
    // published_at can repeat, so id breaks the tie and keeps paging
    // stable. or(...) expresses "strictly older than the last row seen".
    filters.push(
      `or=(published_at.lt.${encodeURIComponent(cursor.publishedAt)},` +
        `and(published_at.eq.${encodeURIComponent(cursor.publishedAt)},id.lt.${cursor.id}))`
    );
  }

  const rows = await select("uwufeed_items", filters.join("&"));

  const items = rows.map(({ uwufeed_sources: source, ...item }) => ({
    ...item,
    source_title: source ? source.title : null,
    source_platform: source ? source.platform : null,
  }));

  const last = items.length === PAGE_SIZE ? items[items.length - 1] : null;

  return json(res, 200, {
    items,
    cursor: last && last.published_at ? encodeCursor(last.published_at, last.id) : null,
  });
}

function encodeCursor(publishedAt, id) {
  return Buffer.from(`${publishedAt}|${id}`, "utf8").toString("base64url");
}

function parseCursor(value) {
  if (!value) return null;
  try {
    const [publishedAt, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
    if (!publishedAt || !id || !/^\d+$/.test(id)) return null;
    return { publishedAt, id: Number(id) };
  } catch {
    return null;
  }
}
