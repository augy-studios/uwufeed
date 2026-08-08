// URL in, source out. The hub check decides the tier, and a source with a
// hub is never polled.

import { selectOne, upsert, update, insertIgnoreDuplicates } from "../_lib/db.js";
import { json, readJsonBody, methodNotAllowed, requireAdmin } from "../_lib/http.js";
import { resolveFeed, platformFor, externalRefFor } from "../_lib/discover.js";
import { normalizeFeed } from "../_lib/normalize.js";
import { newSourceSecret, requestHubSubscription } from "../_lib/websub.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!requireAdmin(req, res)) return;

  const body = await readJsonBody(req);
  if (!body || typeof body.url !== "string") return json(res, 400, { error: "url_required" });

  let input;
  try {
    input = new URL(body.url.trim());
  } catch {
    return json(res, 400, { error: "invalid_url" });
  }
  if (input.protocol !== "http:" && input.protocol !== "https:") {
    return json(res, 400, { error: "unsupported_scheme" });
  }

  const resolved = await resolveFeed(input.toString());
  if (resolved.error) return json(res, 422, resolved);

  const platform = platformFor(resolved.feedUrl);
  const parsed = normalizeFeed(resolved.body, {
    sourceId: 0,
    feedUrl: resolved.feedUrl,
    platform,
  });

  const hubUrl = resolved.hubUrl || parsed.hubUrl || null;
  const tier = hubUrl ? "push" : "poll";

  const existing = await selectOne(
    "uwufeed_sources",
    `feed_url=eq.${encodeURIComponent(resolved.feedUrl)}&select=*`
  );

  const row = {
    platform,
    tier,
    feed_url: resolved.feedUrl,
    external_ref: externalRefFor(platform, resolved.feedUrl),
    title: parsed.title,
    hub_url: hubUrl,
    // Push sources are never polled, and a check constraint enforces it.
    next_check_at: tier === "push" ? null : new Date().toISOString(),
    poll_interval_s: existing?.poll_interval_s ?? 900,
    websub_secret: tier === "push" ? existing?.websub_secret || newSourceSecret() : null,
    retired_at: null,
  };

  const upserted = await upsert("uwufeed_sources", [row], ["feed_url"]);
  const source = Array.isArray(upserted) && upserted.length ? upserted[0] : existing;
  if (!source) return json(res, 500, { error: "source_write_failed" });

  // Seed the items already in the feed so a new source is not empty. These
  // are inserted before the hub subscription exists, so nothing is
  // dispatched for a backfill the user never asked for.
  let seeded = 0;
  if (parsed.items.length) {
    const rows = parsed.items.map((item) => ({ ...item, source_id: source.id }));
    const inserted = await insertIgnoreDuplicates("uwufeed_items", rows, [
      "source_id",
      "external_id",
    ]);
    seeded = Array.isArray(inserted) ? inserted.length : 0;
  }

  let subscription = null;
  if (tier === "push" && body.subscribe !== false) {
    try {
      subscription = await requestHubSubscription(source, "subscribe");
      if (!subscription.ok) {
        await update("uwufeed_sources", `id=eq.${source.id}`, {
          fail_count: (source.fail_count || 0) + 1,
        });
      }
    } catch (err) {
      subscription = { ok: false, reason: err.message };
    }
  }

  return json(res, existing ? 200 : 201, {
    source: {
      id: source.id,
      platform: source.platform,
      tier: source.tier,
      feed_url: source.feed_url,
      title: source.title,
      hub_url: source.hub_url,
      external_ref: source.external_ref,
    },
    created: !existing,
    fetches: resolved.fetches,
    seeded_items: seeded,
    subscription,
  });
}
