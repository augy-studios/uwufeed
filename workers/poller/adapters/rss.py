"""Plain RSS and Atom. The default adapter for the poll tier.

Returns rows already in the item shape from db/schema.md, ready to insert.
Scheduling, conditional requests and backoff belong to the caller.
"""

from urllib.parse import urljoin

import feedparser

from .. import normalize


def parse(body: bytes, source: dict, platform: str | None = None) -> list[dict]:
    parsed = feedparser.parse(body)

    # bozo means the document was malformed. Feed XML in the wild often is,
    # and feedparser still returns usable entries, so it is not by itself a
    # failure. An empty result is what matters.
    feed_url = source.get("feed_url") or ""
    kind_platform = platform or source.get("platform") or "web"

    rows = []
    for entry in parsed.entries:
        row = normalize.normalize_entry(
            entry, source_id=source["id"], platform=kind_platform
        )
        if row is None:
            continue
        # feedparser does not resolve relative links without the request
        # URL, so do it here against the feed rather than storing a path.
        if row["url"]:
            row["url"] = urljoin(feed_url, row["url"])
        if row["thumbnail_url"]:
            row["thumbnail_url"] = urljoin(feed_url, row["thumbnail_url"])
        rows.append(row)

    return rows


def feed_title(body: bytes) -> str | None:
    parsed = feedparser.parse(body)
    title = parsed.feed.get("title") if parsed.feed else None
    return normalize.clean(title, normalize.MAX_TITLE) if title else None
