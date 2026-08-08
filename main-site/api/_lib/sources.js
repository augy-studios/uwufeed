// Turning a URL into a stored source, shared by the admin endpoint and by
// the session authenticated one.
//
// The hub check decides the tier, and a source with a hub is never polled.
// This is the single highest value logic in the project, so it has exactly
// one implementation and both callers go through it.

import { selectOne, upsert, update, insertIgnoreDuplicates } from "./db.js";
import { resolveFeed, platformFor, externalRefFor } from "./discover.js";
import { normalizeFeed } from "./normalize.js";
import { newSourceSecret, requestHubSubscription } from "./websub.js";

export function parseUrl(input) {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    return { error: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "unsupported_scheme" };
  }
  return { url: url.toString() };
}

// Twitch publishes no feed, so it never reaches resolveFeed. The source is
// built from the Helix user lookup and kept live by EventSub instead.
async function resolveTwitch(inputUrl) {
  const { configured, lookupUser, subscribeStreamOnline } = await import("./twitch.js");
  if (!configured()) return { error: "twitch_not_configured" };

  let login;
  try {
    login = new URL(inputUrl).pathname.split("/").filter(Boolean)[0];
  } catch {
    return { error: "invalid_url" };
  }
  if (!login) return { error: "no_feed_found" };

  const user = await lookupUser(login);
  if (!user) return { error: "no_feed_found" };

  const feedUrl = `https://www.twitch.tv/${user.login}`;
  const existing = await selectOne(
    "uwufeed_sources",
    `feed_url=eq.${encodeURIComponent(feedUrl)}&select=*`
  );

  const upserted = await upsert(
    "uwufeed_sources",
    [
      {
        platform: "twitch",
        tier: "push",
        feed_url: feedUrl,
        external_ref: user.id,
        title: user.name || user.login,
        hub_url: "https://api.twitch.tv/helix/eventsub/subscriptions",
        next_check_at: null,
        retired_at: null,
      },
    ],
    ["feed_url"]
  );
  const source = Array.isArray(upserted) && upserted.length ? upserted[0] : existing;
  if (!source) return { error: "source_write_failed" };

  let subscription = null;
  if (!existing) {
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    const result = await subscribeStreamOnline(user.id, `${base}/api/hooks/eventsub`);
    subscription = { ok: result.ok, status: result.status };
  }

  // Nothing to seed: a stream that is not live has no item, and a stream
  // that is live already was not announced by us.
  return { source, created: !existing, fetches: 1, seeded: 0, subscription };
}

// Resolve, store, seed and subscribe. Returns the source row.
export async function resolveAndStore(inputUrl, { subscribeToHub = true } = {}) {
  if (platformFor(inputUrl) === "twitch") return resolveTwitch(inputUrl);

  const resolved = await resolveFeed(inputUrl);
  if (resolved.error) return { error: resolved.error, status: resolved.status };

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
  if (!source) return { error: "source_write_failed" };

  // Seed what is already in the feed, so a new source is not empty. These
  // land before the hub subscription exists, so nobody is notified about a
  // backfill they never asked for.
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
  if (tier === "push" && subscribeToHub && !existing?.lease_expires_at) {
    // Only for a genuinely new push source. Re-subscribing one that
    // already has a live lease is a wasted request to someone else's hub
    // every time a second person follows the same channel.
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

  return {
    source,
    created: !existing,
    fetches: resolved.fetches,
    seeded,
    subscription,
  };
}

// What the browser and the bots see. Never the websub secret.
export function publicSource(source) {
  return {
    id: source.id,
    platform: source.platform,
    tier: source.tier,
    feed_url: source.feed_url,
    title: source.title,
    external_ref: source.external_ref,
    retired_at: source.retired_at ?? null,
  };
}

export const RESOLVE_ERRORS = new Set([
  "invalid_url",
  "unsupported_scheme",
  "no_feed_found",
  "fetch_failed",
  "feed_fetch_failed",
]);
