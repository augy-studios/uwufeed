"""Shared formatting for bot messages.

HTML parse mode rather than Markdown, because feed titles are full of
characters Markdown treats as syntax and Telegram rejects the message
rather than escaping them for you.
"""

from datetime import datetime, timezone

KIND_LABEL = {"video": "video", "article": "post", "post": "post", "stream": "live"}


def esc(value) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def truncate(value: str, limit: int) -> str:
    text = str(value or "")
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def relative(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        then = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return ""
    seconds = (datetime.now(timezone.utc) - then).total_seconds()
    if seconds < 60:
        return "just now"
    if seconds < 3600:
        return f"{int(seconds // 60)}m ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)}h ago"
    return f"{int(seconds // 86400)}d ago"


def source_line(index: int, source: dict) -> str:
    title = esc(truncate(source.get("title") or source.get("feed_url"), 60))
    speed = "seconds" if source.get("tier") == "push" else "hourly"
    retired = " <i>retired</i>" if source.get("retired_at") else ""
    return f"{index}. <b>{title}</b> <i>({speed})</i>{retired}"


def item_line(item: dict) -> str:
    title = esc(truncate(item.get("title") or "Untitled", 80))
    when = relative(item.get("published_at"))
    kind = KIND_LABEL.get(item.get("kind"), "post")
    url = item.get("url")
    head = f'<a href="{esc(url)}">{title}</a>' if url else title
    tail = " and ".join(x for x in (kind, when) if x)
    return f"{head}\n<i>{esc(tail)}</i>"
