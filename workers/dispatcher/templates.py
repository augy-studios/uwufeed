"""Typed render context per item kind.

Formatting is driven by these objects rather than hardcoded embeds, so a
server admin can customise output without new code per platform. Phase 1
ships the defaults; user templates from uwufeed_templates come later.
"""

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class RenderContext:
    kind: str
    title: str
    url: str | None
    author: str | None
    summary: str | None
    thumbnail_url: str | None
    published_at: str | None
    source_title: str | None

    @property
    def source_name(self) -> str:
        return self.source_title or self.author or "Unknown source"

    @property
    def published_dt(self) -> datetime | None:
        if not self.published_at:
            return None
        try:
            return datetime.fromisoformat(self.published_at.replace("Z", "+00:00"))
        except ValueError:
            return None

    @property
    def timestamp_iso(self) -> str:
        dt = self.published_dt or datetime.now(timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()


def context_from_item(item: dict, source_title: str | None = None) -> RenderContext:
    return RenderContext(
        kind=item.get("kind") or "post",
        title=item.get("title") or "Untitled",
        url=item.get("url"),
        author=item.get("author"),
        summary=item.get("summary"),
        thumbnail_url=item.get("thumbnail_url"),
        published_at=item.get("published_at"),
        source_title=source_title,
    )


HEADLINES = {
    "video": "New video from {source}",
    "article": "New post from {source}",
    "post": "New post from {source}",
    "stream": "{source} is live",
}


def headline(ctx: RenderContext) -> str:
    return HEADLINES.get(ctx.kind, HEADLINES["post"]).format(source=ctx.source_name)


def summary_for(ctx: RenderContext, limit: int = 300) -> str | None:
    if not ctx.summary:
        return None
    text = ctx.summary.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
