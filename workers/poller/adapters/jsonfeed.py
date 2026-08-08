"""JSON Feed.

Autodiscovered at signup and parsed here. The spec is small
enough that this needs no library: it is a JSON document with an items
array.

https://www.jsonfeed.org/version/1.1/
"""

import json
from urllib.parse import urljoin

from .. import normalize


def looks_like_json_feed(body: bytes) -> bool:
    head = body[:200].lstrip()
    return head.startswith(b"{") and b"jsonfeed.org" in body[:2000]


def parse(body: bytes, source: dict, platform: str | None = None) -> list[dict]:
    try:
        doc = json.loads(body)
    except (ValueError, TypeError):
        return []

    feed_url = source.get("feed_url") or ""
    kind_platform = platform or source.get("platform") or "web"

    rows = []
    for entry in doc.get("items") or []:
        if not isinstance(entry, dict):
            continue

        url = entry.get("url") or entry.get("external_url")
        # id is required by the spec and is the dedup key. Falling back to
        # the URL matches what the item shape says to do.
        external_id = str(entry.get("id") or url or "").strip()
        if not external_id:
            continue

        # content_text is plain by definition; content_html needs stripping.
        summary = entry.get("summary") or entry.get("content_text")
        if not summary and entry.get("content_html"):
            summary = normalize.strip_markup(entry["content_html"])

        author = None
        authors = entry.get("authors") or doc.get("authors") or []
        if authors and isinstance(authors, list) and isinstance(authors[0], dict):
            author = authors[0].get("name")
        elif isinstance(entry.get("author"), dict):
            author = entry["author"].get("name")

        rows.append(
            {
                "source_id": source["id"],
                "external_id": normalize.clean(external_id, normalize.MAX_EXTERNAL_ID),
                "title": normalize.clean(entry.get("title"), normalize.MAX_TITLE),
                "url": urljoin(feed_url, url) if url else None,
                "author": normalize.clean(author, normalize.MAX_AUTHOR),
                "summary": normalize.clean_rich_text(summary, normalize.MAX_SUMMARY),
                "thumbnail_url": (
                    urljoin(feed_url, entry["image"]) if entry.get("image") else None
                ),
                "published_at": normalize.to_iso(
                    entry.get("date_published") or entry.get("date_modified")
                ),
                "kind": normalize.kind_for({}, kind_platform),
            }
        )

    return rows
