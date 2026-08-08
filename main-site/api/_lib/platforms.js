// Platforms that need something other than "fetch it and look for a hub".
//
// Three kinds live here: sites whose feed URL is derivable, sites reached
// through RSSHub, and Bluesky, which has no feed at all and is handled by
// the Jetstream listener instead.

import { USER_AGENT } from "./http.js";

// ---- RSSHub ----

// A curated map, not an attempt at RSSHub's whole route list. Each entry
// turns a URL a person would paste into the route that serves it, so
// nobody has to learn the word RSSHub.
//
// These break when RSSHub changes a route, which it does. When one stops
// working the symptom is "no feed found" on a URL that used to work.
const RSSHUB_ROUTES = [
  { host: /^(www\.)?(twitter|x)\.com$/, path: /^\/([A-Za-z0-9_]{1,15})\/?$/, route: (m) => `/twitter/user/${m[1]}` },
  { host: /^(www\.)?instagram\.com$/, path: /^\/([A-Za-z0-9_.]+)\/?$/, route: (m) => `/instagram/user/${m[1]}` },
  { host: /^(www\.)?weibo\.com$/, path: /^\/u\/(\d+)\/?$/, route: (m) => `/weibo/user/${m[1]}` },
  { host: /^space\.bilibili\.com$/, path: /^\/(\d+)\/?$/, route: (m) => `/bilibili/user/dynamic/${m[1]}` },
  { host: /^(www\.)?pixiv\.net$/, path: /^\/users\/(\d+)\/?$/, route: (m) => `/pixiv/user/${m[1]}` },
];

export function rsshubUrl(input) {
  const base = (process.env.RSSHUB_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;

  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  for (const entry of RSSHUB_ROUTES) {
    if (!entry.host.test(url.hostname)) continue;
    const match = entry.path.exec(url.pathname);
    if (match) return `${base}${entry.route(match)}`;
  }
  return null;
}

// ---- Mastodon ----

// Every Mastodon account publishes instance/@user.rss. Profile pages
// normally advertise it through autodiscovery, so this is the fallback for
// when the page cannot be parsed, which is common behind Cloudflare.
export function mastodonFeedUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.pathname.endsWith(".rss")) return null;

  const match = /^\/@([A-Za-z0-9_]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  return `${url.origin}/@${match[1]}.rss`;
}

// ---- Bluesky ----

// Bluesky has no feed. The source is identified by its DID and kept live
// by the Jetstream listener on the VPS.
export function blueskyHandle(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (!/^(www\.)?bsky\.app$/.test(url.hostname)) return null;

  const match = /^\/profile\/([^/]+)\/?$/.exec(url.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function resolveBlueskyDid(handle) {
  const url =
    "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=" +
    encodeURIComponent(handle);
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.did || null;
  } catch {
    return null;
  }
}
