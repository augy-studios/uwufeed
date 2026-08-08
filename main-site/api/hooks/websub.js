// The instant path. A hub calls GET once to verify the subscription, then
// POSTs the feed every time it changes. No cron is involved.

import { selectOne, update, insertIgnoreDuplicates } from "../_lib/db.js";
import { json, text, readRawBody } from "../_lib/http.js";
import { verifyCallbackToken, verifySignature } from "../_lib/websub.js";
import { normalizeFeed } from "../_lib/normalize.js";

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const sourceId = url.searchParams.get("source_id");
  const token = url.searchParams.get("t");

  if (!sourceId || !verifyCallbackToken(sourceId, token)) {
    return text(res, 404, "not found");
  }

  const source = await selectOne("uwufeed_sources", `id=eq.${encodeURIComponent(sourceId)}&select=*`);
  if (!source) return text(res, 404, "not found");

  if (req.method === "GET") return handleVerification(req, res, url, source);
  if (req.method === "POST") return handleNotification(req, res, source);

  res.setHeader("allow", "GET, POST");
  return text(res, 405, "method not allowed");
}

// The hub echoes hub.challenge and expects it back verbatim. Anything else,
// including a redirect or a JSON wrapper, and the subscription fails.
async function handleVerification(req, res, url, source) {
  const mode = url.searchParams.get("hub.mode");
  const topic = url.searchParams.get("hub.topic");
  const challenge = url.searchParams.get("hub.challenge");
  const lease = parseInt(url.searchParams.get("hub.lease_seconds") || "", 10);

  if (mode === "denied") {
    await update("uwufeed_sources", `id=eq.${source.id}`, {
      lease_expires_at: null,
      fail_count: (source.fail_count || 0) + 1,
    });
    return text(res, 200, "ok");
  }

  if (topic && topic !== source.feed_url) return text(res, 404, "topic mismatch");
  if (!challenge) return text(res, 400, "missing challenge");

  if (mode === "subscribe") {
    const seconds = Number.isFinite(lease) && lease > 0 ? lease : 864000;
    await update("uwufeed_sources", `id=eq.${source.id}`, {
      tier: "push",
      next_check_at: null,
      fail_count: 0,
      lease_expires_at: new Date(Date.now() + seconds * 1000).toISOString(),
    });
  } else if (mode === "unsubscribe") {
    await update("uwufeed_sources", `id=eq.${source.id}`, { lease_expires_at: null });
  } else {
    return text(res, 400, "unknown mode");
  }

  return text(res, 200, challenge);
}

// A hub re-fires on title and description edits, so the same video arrives
// repeatedly. Dedup is the database's job, not this function's.
async function handleNotification(req, res, source) {
  const raw = await readRawBody(req);
  const signature = req.headers["x-hub-signature"] || req.headers["x-hub-signature-256"];

  if (source.websub_secret) {
    const check = verifySignature(raw, signature, source.websub_secret);
    if (!check.ok) {
      console.warn(`websub signature rejected for source ${source.id}: ${check.reason}`);
      return text(res, 403, "invalid signature");
    }
  }

  const { items } = normalizeFeed(raw.toString("utf8"), {
    sourceId: source.id,
    feedUrl: source.feed_url,
    platform: source.platform,
  });

  if (!items.length) return text(res, 204, "");

  try {
    await insertIgnoreDuplicates("uwufeed_items", items, ["source_id", "external_id"]);
  } catch (err) {
    console.error(`websub insert failed for source ${source.id}: ${err.message}`);
    return json(res, 500, { error: "insert_failed" });
  }

  // 204 tells the hub the notification was accepted. Delivery is the
  // dispatcher's problem, reached over Realtime.
  return text(res, 204, "");
}
