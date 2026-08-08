// Turning a URL a human pasted into a feed URL, a platform and a tier.
// The hub check here is the highest value code in the project: a source
// that has a hub is never polled again.

import { decodeEntities, absolute, findHub, looksLikeFeed } from "./normalize.js";
import { USER_AGENT } from "./http.js";

const FEED_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
  "application/json",
  "text/xml",
];

export async function fetchDocument(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
    },
  });
  const body = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    finalUrl: res.url || url,
    contentType: (res.headers.get("content-type") || "").toLowerCase(),
    linkHeader: res.headers.get("link") || "",
    body,
  };
}

// A hub can also be advertised in an HTTP Link header rather than the body.
export function hubFromLinkHeader(header) {
  if (!header) return null;
  for (const part of header.split(/,(?=\s*<)/)) {
    const url = /<([^>]+)>/.exec(part);
    const rel = /rel\s*=\s*"?([^";]+)"?/i.exec(part);
    if (url && rel && rel[1].toLowerCase().split(/\s+/).includes("hub")) return url[1].trim();
  }
  return null;
}

function htmlTags(html, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?\\/?>`, "gi");
  return html.match(re) || [];
}

function attrIn(tagString, attr) {
  const re = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = re.exec(tagString);
  return match ? decodeEntities(match[1]) : null;
}

// <link rel="alternate" type="application/rss+xml" href="...">
export function autodiscoverFeed(html, baseUrl) {
  for (const tag of htmlTags(html, "link")) {
    const rel = (attrIn(tag, "rel") || "").toLowerCase().split(/\s+/);
    const type = (attrIn(tag, "type") || "").toLowerCase();
    if (rel.includes("alternate") && FEED_TYPES.includes(type)) {
      const href = absolute(attrIn(tag, "href"), baseUrl);
      if (href) return href;
    }
  }
  return null;
}

export function hubFromHtml(html) {
  for (const tag of htmlTags(html, "link")) {
    const rel = (attrIn(tag, "rel") || "").toLowerCase().split(/\s+/);
    if (rel.includes("hub")) {
      const href = attrIn(tag, "href");
      if (href) return href;
    }
  }
  return null;
}

// YouTube never advertises its feed on the channel page in a form worth
// trusting, but the feed URL is derivable from the channel id.
export function youtubeFeedUrl(input, html) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/.test(url.hostname) && url.hostname !== "youtu.be") return null;

  const existing = url.searchParams.get("channel_id");
  if (url.pathname === "/feeds/videos.xml" && existing) return input;

  const fromPath = /^\/channel\/(UC[\w-]{20,})/.exec(url.pathname);
  if (fromPath) return `https://www.youtube.com/feeds/videos.xml?channel_id=${fromPath[1]}`;

  if (html) {
    const meta = /"(?:channelId|externalId)"\s*:\s*"(UC[\w-]{20,})"/.exec(html)
      || /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[\w-]{20,})["']/i.exec(html)
      || /channel\/(UC[\w-]{20,})/.exec(html);
    if (meta) return `https://www.youtube.com/feeds/videos.xml?channel_id=${meta[1]}`;
  }
  return null;
}

export function platformFor(feedUrl) {
  let host;
  try {
    host = new URL(feedUrl).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
  if (host.endsWith("youtube.com")) return "youtube";
  if (host.endsWith("reddit.com")) return "reddit";
  if (host.endsWith("twitch.tv")) return "twitch";
  if (host.endsWith("bsky.app") || host.endsWith("bsky.social")) return "bluesky";
  return "web";
}

export function externalRefFor(platform, feedUrl) {
  if (platform !== "youtube") return null;
  try {
    return new URL(feedUrl).searchParams.get("channel_id");
  } catch {
    return null;
  }
}

// One fetch of the URL given. If that turns out to be an HTML page, one
// more fetch of the feed it points at, because a hub is advertised in the
// feed rather than the page on most platforms.
export async function resolveFeed(inputUrl) {
  const first = await fetchDocument(inputUrl);
  if (!first.ok) {
    return { error: "fetch_failed", status: first.status, url: inputUrl };
  }

  const isHtml = first.contentType.includes("text/html") || !looksLikeFeed(first.body);

  if (!isHtml) {
    return {
      feedUrl: first.finalUrl,
      body: first.body,
      hubUrl: findHub(first.body) || hubFromLinkHeader(first.linkHeader),
      fetches: 1,
    };
  }

  const feedUrl =
    youtubeFeedUrl(first.finalUrl, first.body) || autodiscoverFeed(first.body, first.finalUrl);
  if (!feedUrl) {
    return { error: "no_feed_found", url: first.finalUrl };
  }

  const second = await fetchDocument(feedUrl);
  if (!second.ok || !looksLikeFeed(second.body)) {
    return { error: "feed_fetch_failed", status: second.status, url: feedUrl };
  }

  return {
    feedUrl: second.finalUrl,
    body: second.body,
    hubUrl:
      findHub(second.body) ||
      hubFromLinkHeader(second.linkHeader) ||
      hubFromHtml(first.body) ||
      hubFromLinkHeader(first.linkHeader),
    fetches: 2,
  };
}
