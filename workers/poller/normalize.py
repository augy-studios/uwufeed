"""The Python half of the item shape contract.

Mirrors main-site/api/_lib/normalize.js. Both produce the same object from
the same feed, and db/schema.md is the specification both follow.

Written ahead of the adapters that use it, because the item shape is
frozen and a contract with only one implementation is not a contract.
"""

import html
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

MAX_TITLE = 500
MAX_SUMMARY = 500
MAX_AUTHOR = 200
MAX_EXTERNAL_ID = 512

KINDS = ("video", "article", "post", "stream")


def clean(value: str | None, limit: int) -> str | None:
    """Decode entities and collapse whitespace. Markup is left alone."""
    if not value:
        return None
    text = " ".join(html.unescape(str(value)).split()).strip()
    if not text:
        return None
    return text[:limit]


def clean_rich_text(value: str | None, limit: int) -> str | None:
    """For summaries, which carry escaped markup.

    Order matters: decode first, then strip. The other way round leaves
    tags in the output. Titles are the opposite case and are never
    stripped, since a title containing <test> means those characters.
    """
    if not value:
        return None
    text = " ".join(re.sub(r"<[^>]*>", " ", html.unescape(str(value))).split()).strip()
    if not text:
        return None
    return text[:limit]


def to_iso(value) -> str | None:
    """ISO 8601 UTC with a Z suffix, or None. Never now()."""
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        dt = None
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            try:
                dt = parsedate_to_datetime(text)
            except (TypeError, ValueError):
                return None
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def pick_external_id(entry: dict, url: str | None) -> str | None:
    """Resolution order is fixed in db/schema.md.

    Never derive an id from position in the feed. A video published late
    sits below newer entries, and a feed that reorders re-inserts the lot.
    """
    for key in ("yt_videoid", "id", "guid"):
        value = entry.get(key)
        if value:
            return clean(str(value), MAX_EXTERNAL_ID)
    return clean(url, MAX_EXTERNAL_ID) if url else None


def normalize_entry(entry: dict, *, source_id: int, platform: str = "web") -> dict | None:
    """One parsed feed entry in, one uwufeed_items row out.

    `entry` is feedparser shaped: a mapping with link, title, author,
    summary, published, and optionally yt_videoid and media_thumbnail.
    """
    url = entry.get("link") or None
    external_id = pick_external_id(entry, url)
    if not external_id:
        return None

    return {
        "source_id": source_id,
        "external_id": external_id,
        "title": clean(entry.get("title"), MAX_TITLE),
        "url": url,
        "author": clean(entry.get("author"), MAX_AUTHOR),
        "summary": clean_rich_text(entry.get("summary"), MAX_SUMMARY),
        "thumbnail_url": first_thumbnail(entry),
        "published_at": to_iso(entry.get("published") or entry.get("updated")),
        "kind": kind_for(entry, platform),
    }


def kind_for(entry: dict, platform: str) -> str:
    if entry.get("yt_videoid") or platform == "youtube":
        return "video"
    if platform == "twitch":
        return "stream"
    if platform in ("reddit", "mastodon", "bluesky"):
        return "post"
    return "article"


def first_thumbnail(entry: dict) -> str | None:
    thumbs = entry.get("media_thumbnail") or []
    if thumbs and isinstance(thumbs, list):
        url = thumbs[0].get("url") if isinstance(thumbs[0], dict) else None
        if url:
            return url
    for enclosure in entry.get("links") or []:
        if isinstance(enclosure, dict) and str(enclosure.get("type", "")).startswith("image/"):
            return enclosure.get("href")
    return None


def strip_markup(value) -> str | None:
    if not value:
        return None
    return re.sub(r"<[^>]*>", " ", str(value))
