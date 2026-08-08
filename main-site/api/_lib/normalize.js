// Feed XML in, the item shape from db/schema.md out.
// Deliberately a small tolerant scanner rather than a real XML parser: no
// dependencies, and feed XML in the wild is rarely well formed anyway.

const MAX_TITLE = 500;
const MAX_SUMMARY = 500;
const MAX_AUTHOR = 200;
const MAX_EXTERNAL_ID = 512;

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#34": '"',
};

export function decodeEntities(input) {
  if (!input) return "";
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(ENTITIES, name)) return ENTITIES[name];
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X"
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function clean(value, max) {
  if (!value) return null;
  const out = decodeEntities(String(value)).replace(/\s+/g, " ").trim();
  if (!out) return null;
  return out.length > max ? out.slice(0, max) : out;
}

// Collapse without decoding, for text that has already been decoded.
function collapse(value, max) {
  if (!value) return null;
  const out = String(value).replace(/\s+/g, " ").trim();
  if (!out) return null;
  return out.length > max ? out.slice(0, max) : out;
}

// Summaries carry escaped markup, so the order matters: decode first, then
// strip. Doing it the other way leaves tags in the output. Titles are the
// opposite case and are never stripped, since a title containing <test>
// means those characters literally.
function cleanRichText(value, max) {
  if (!value) return null;
  return collapse(stripTags(decodeEntities(String(value))), max);
}

function stripTags(value) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ");
}

function unwrapCdata(value) {
  const match = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(value);
  return match ? match[1] : value;
}

// Matches <tag> and <tag attr="x">, but not <ns:tag>, because the search
// string starts with the opening angle bracket.
export function tagText(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, "i");
  const match = re.exec(xml);
  return match ? unwrapCdata(match[1]) : null;
}

export function tagAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?\\s${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = re.exec(xml);
  return match ? decodeEntities(match[1]) : null;
}

function allTags(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?\\/?>`, "gi");
  return xml.match(re) || [];
}

function attrIn(tagString, attr) {
  const re = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = re.exec(tagString);
  return match ? decodeEntities(match[1]) : null;
}

export function absolute(href, base) {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function toIso(value) {
  if (!value) return null;
  const parsed = new Date(decodeEntities(value).trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// The hub can be advertised on <link rel="hub"> or <atom:link rel="hub">.
export function findHub(xml) {
  for (const tag of [...allTags(xml, "link"), ...allTags(xml, "atom:link")]) {
    const rel = (attrIn(tag, "rel") || "").toLowerCase();
    if (rel.split(/\s+/).includes("hub")) {
      const href = attrIn(tag, "href");
      if (href) return href;
    }
  }
  return null;
}

export function findSelfLink(xml) {
  for (const tag of [...allTags(xml, "link"), ...allTags(xml, "atom:link")]) {
    if ((attrIn(tag, "rel") || "").toLowerCase() === "self") {
      const href = attrIn(tag, "href");
      if (href) return href;
    }
  }
  return null;
}

export function looksLikeFeed(body) {
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(body.slice(0, 4000));
}

function entryBlocks(xml) {
  const atom = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry\s*>/gi);
  if (atom && atom.length) return { blocks: atom, format: "atom" };
  const rss = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi);
  if (rss && rss.length) return { blocks: rss, format: "rss" };
  return { blocks: [], format: "unknown" };
}

function entryUrl(block, format, baseUrl) {
  if (format === "rss") {
    const direct = tagText(block, "link");
    const resolved = absolute(direct && stripTags(direct).trim(), baseUrl);
    if (resolved) return resolved;
  }
  const links = allTags(block, "link");
  const alternate = links.find((t) => (attrIn(t, "rel") || "alternate").toLowerCase() === "alternate");
  const chosen = alternate || links[0];
  return absolute(chosen && attrIn(chosen, "href"), baseUrl);
}

function entryThumbnail(block, baseUrl) {
  const thumb = tagAttr(block, "media:thumbnail", "url");
  if (thumb) return absolute(thumb, baseUrl);
  for (const tag of allTags(block, "media:content")) {
    const type = (attrIn(tag, "type") || "").toLowerCase();
    const medium = (attrIn(tag, "medium") || "").toLowerCase();
    if (medium === "image" || type.startsWith("image/")) {
      const resolved = absolute(attrIn(tag, "url"), baseUrl);
      if (resolved) return resolved;
    }
  }
  for (const tag of allTags(block, "enclosure")) {
    if ((attrIn(tag, "type") || "").toLowerCase().startsWith("image/")) {
      const resolved = absolute(attrIn(tag, "url"), baseUrl);
      if (resolved) return resolved;
    }
  }
  return null;
}

function entryAuthor(block) {
  const atomAuthor = tagText(block, "author");
  if (atomAuthor) {
    const name = tagText(atomAuthor, "name");
    if (name) return clean(name, MAX_AUTHOR);
    return clean(stripTags(atomAuthor), MAX_AUTHOR);
  }
  const creator = tagText(block, "dc:creator");
  if (creator) return clean(stripTags(creator), MAX_AUTHOR);
  return null;
}

function entrySummary(block) {
  const candidates = [
    tagText(block, "media:description"),
    tagText(block, "summary"),
    tagText(block, "description"),
    tagText(block, "content:encoded"),
    tagText(block, "content"),
  ];
  for (const candidate of candidates) {
    const value = cleanRichText(candidate, MAX_SUMMARY);
    if (value) return value;
  }
  return null;
}

// Resolution order is fixed in db/schema.md. Never derive an id from
// position in the feed: a late published video sits below newer entries.
function entryExternalId(block, url) {
  const videoId = tagText(block, "yt:videoId");
  if (videoId) return clean(videoId, MAX_EXTERNAL_ID);
  const atomId = tagText(block, "id");
  if (atomId) return clean(stripTags(atomId), MAX_EXTERNAL_ID);
  const guid = tagText(block, "guid");
  if (guid) return clean(stripTags(guid), MAX_EXTERNAL_ID);
  return url ? clean(url, MAX_EXTERNAL_ID) : null;
}

function entryKind(block, platform) {
  if (tagText(block, "yt:videoId") || platform === "youtube") return "video";
  if (platform === "twitch") return "stream";
  if (platform === "reddit" || platform === "mastodon" || platform === "bluesky") return "post";
  return "article";
}

export function feedTitle(xml) {
  const channel = tagText(xml, "channel");
  const raw = tagText(channel || xml, "title");
  return clean(stripTags(raw || ""), MAX_TITLE);
}

// One feed document in, rows ready for uwufeed_items out.
export function normalizeFeed(xml, { sourceId, feedUrl, platform = "web" }) {
  const { blocks, format } = entryBlocks(xml);
  const items = [];

  for (const block of blocks) {
    const url = entryUrl(block, format, feedUrl);
    const externalId = entryExternalId(block, url);
    if (!externalId) continue;

    items.push({
      source_id: sourceId,
      external_id: externalId,
      title: clean(stripTags(tagText(block, "title") || tagText(block, "media:title") || ""), MAX_TITLE),
      url,
      author: entryAuthor(block),
      summary: entrySummary(block),
      thumbnail_url: entryThumbnail(block, feedUrl),
      published_at:
        toIso(tagText(block, "published")) ||
        toIso(tagText(block, "pubDate")) ||
        toIso(tagText(block, "dc:date")) ||
        toIso(tagText(block, "updated")),
      kind: entryKind(block, platform),
    });
  }

  return { format, title: feedTitle(xml), hubUrl: findHub(xml), items };
}
