// Twitch EventSub receiver, stream.online.

import { selectOne, select, update, insertIgnoreDuplicates } from "../_lib/db.js";
import { json, text, readRawBody } from "../_lib/http.js";
import { verifySignature, MESSAGE_TYPES } from "../_lib/twitch.js";

// A stream that drops and reconnects should not announce itself twice. If
// this source already produced a live item recently, the new one is a
// flicker rather than a fresh broadcast.
//
// Implemented as a lookback rather than a delay on purpose: holding every
// alert for ten minutes to see whether it sticks would throw away the two
// to ten second latency that is the whole point of the push tier.
const FLICKER_WINDOW_MINUTES = 10;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return text(res, 405, "method not allowed");
  }

  const raw = await readRawBody(req);
  const check = verifySignature(req.headers, raw);
  if (!check.ok) {
    console.warn(`eventsub signature rejected: ${check.reason}`);
    return text(res, 403, "invalid signature");
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return text(res, 400, "invalid body");
  }

  const messageType = req.headers["twitch-eventsub-message-type"];

  // Twitch wants the challenge back as raw text, nothing else. A JSON
  // wrapper or a trailing newline fails the verification and the
  // subscription never activates.
  if (messageType === MESSAGE_TYPES.VERIFICATION) {
    return text(res, 200, String(payload.challenge || ""));
  }

  if (messageType === MESSAGE_TYPES.REVOCATION) {
    return handleRevocation(res, payload);
  }

  if (messageType !== MESSAGE_TYPES.NOTIFICATION) {
    return text(res, 204, "");
  }

  return handleNotification(res, payload);
}

async function handleRevocation(res, payload) {
  const broadcasterId = payload?.subscription?.condition?.broadcaster_user_id;
  const source = await findSource(broadcasterId);
  if (source) {
    // Twitch has stopped sending. Nothing will arrive again until it is
    // resubscribed, so record it rather than going quiet.
    await update("uwufeed_sources", `id=eq.${source.id}`, {
      lease_expires_at: null,
      fail_count: (source.fail_count || 0) + 1,
    });
    console.warn(
      `eventsub revoked for source ${source.id}: ${payload?.subscription?.status}`
    );
  }
  return text(res, 204, "");
}

async function handleNotification(res, payload) {
  const event = payload.event || {};
  const broadcasterId = event.broadcaster_user_id;
  const source = await findSource(broadcasterId);
  if (!source) return text(res, 204, "");

  if (payload?.subscription?.type !== "stream.online") return text(res, 204, "");

  if (await recentlyLive(source.id)) {
    console.log(`eventsub flicker ignored for source ${source.id}`);
    return text(res, 204, "");
  }

  const name = event.broadcaster_user_name || source.title || "Someone";
  const login = event.broadcaster_user_login || "";

  const item = {
    source_id: source.id,
    // The stream id, never the broadcaster id. A restart is a new stream
    // and should announce; using the broadcaster id would silence it
    // forever after the first one.
    external_id: String(event.id || `${broadcasterId}:${event.started_at}`),
    title: `${name} is live`,
    url: login ? `https://www.twitch.tv/${login}` : null,
    author: name,
    summary: null,
    thumbnail_url: null,
    published_at: event.started_at || new Date().toISOString(),
    kind: "stream",
  };

  try {
    await insertIgnoreDuplicates("uwufeed_items", [item], ["source_id", "external_id"]);
    await update("uwufeed_sources", `id=eq.${source.id}`, { fail_count: 0 });
  } catch (err) {
    console.error(`eventsub insert failed for source ${source.id}: ${err.message}`);
    return json(res, 500, { error: "insert_failed" });
  }

  return text(res, 204, "");
}

function findSource(broadcasterId) {
  if (!broadcasterId) return null;
  return selectOne(
    "uwufeed_sources",
    `platform=eq.twitch&external_ref=eq.${encodeURIComponent(broadcasterId)}&select=*`
  );
}

async function recentlyLive(sourceId) {
  const since = new Date(Date.now() - FLICKER_WINDOW_MINUTES * 60 * 1000).toISOString();
  const rows = await select(
    "uwufeed_items",
    `source_id=eq.${sourceId}&kind=eq.stream&published_at=gt.${encodeURIComponent(since)}` +
      "&select=id&limit=1"
  );
  return rows.length > 0;
}
