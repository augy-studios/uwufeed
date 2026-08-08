"""How long a held notification is still worth sending.

Quiet hours defer a delivery rather than dropping it. That is right for a
blog post or a video, which are still there in the morning, and wrong for a
live stream: "somebody is live" delivered eight hours later announces
something that is no longer happening.

So a deferred delivery has a shelf life, and it depends on the kind. This is
the whole reason quiet hours cannot simply be a delay.
"""

from datetime import datetime, timedelta, timezone

# None means it never goes stale. A video published at 2am is just as
# watchable at 8am, and a blog post more so.
SHELF_LIFE = {
    "stream": timedelta(hours=2),
    "video": None,
    "article": None,
    "post": None,
}

# Short form social ages badly in bulk but is not time critical the way a
# stream is, so it keeps a generous window rather than none.
DEFAULT_SHELF_LIFE = None


def shelf_life(kind: str) -> timedelta | None:
    return SHELF_LIFE.get(kind, DEFAULT_SHELF_LIFE)


def is_stale(item: dict, now: datetime | None = None) -> bool:
    """True when a held item is no longer worth sending."""
    window = shelf_life(item.get("kind") or "post")
    if window is None:
        return False

    stamp = item.get("published_at") or item.get("fetched_at")
    if not stamp:
        return False

    try:
        published = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    except ValueError:
        return False

    return (now or datetime.now(timezone.utc)) - published > window
