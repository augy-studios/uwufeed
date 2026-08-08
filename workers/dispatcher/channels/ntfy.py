"""ntfy and UnifiedPush delivery.

An HTTP POST to a topic. No key management and no subscription lifecycle,
which is the whole appeal, and it reaches Android devices with no Google
services on them.
"""

import asyncio
import os

import httpx

from ..errors import PermanentFailure
from ..templates import RenderContext, headline, summary_for

DEFAULT_BASE = "https://ntfy.sh"

PRIORITY = {"stream": "high", "video": "default", "article": "default", "post": "low"}


def base_url() -> str:
    return os.environ.get("NTFY_BASE_URL", DEFAULT_BASE).rstrip("/")


def build_headers(ctx: RenderContext) -> dict:
    """Metadata goes in headers. The body is plain text.

    Header values must be latin-1, and feed titles very often are not, so
    anything non ascii is dropped rather than allowed to break the request.
    """
    headers = {
        "Title": _ascii(headline(ctx))[:200],
        "Priority": PRIORITY.get(ctx.kind, "default"),
        "Tags": ctx.kind,
    }
    if ctx.url:
        headers["Click"] = ctx.url
    if ctx.thumbnail_url:
        headers["Attach"] = ctx.thumbnail_url
    return headers


def _ascii(value: str) -> str:
    return value.encode("ascii", "ignore").decode("ascii") or "uwuFeed"


def build_body(ctx: RenderContext) -> str:
    parts = [ctx.title]
    summary = summary_for(ctx, limit=200)
    if summary:
        parts.append(summary)
    return "\n\n".join(parts)


async def send(client: httpx.AsyncClient, topic: str, ctx: RenderContext) -> bool:
    url = f"{base_url()}/{topic.strip('/')}"

    for attempt in range(3):
        try:
            res = await client.post(
                url,
                content=build_body(ctx).encode("utf-8"),
                headers=build_headers(ctx),
                timeout=15.0,
            )
        except httpx.HTTPError as err:
            print(f"ntfy transport error: {type(err).__name__}")
            await asyncio.sleep(2 ** attempt)
            continue

        if res.status_code in (200, 202):
            return True

        if res.status_code == 429:
            await asyncio.sleep(min(float(res.headers.get("retry-after", 5)), 60.0))
            continue

        # A topic the server refuses is not going to start working. Anything
        # else in the 4xx range is the same story.
        if res.status_code in (401, 403, 404):
            raise PermanentFailure(f"ntfy refused topic: {res.status_code}")

        if 500 <= res.status_code < 600:
            await asyncio.sleep(2 ** attempt)
            continue

        print(f"ntfy error {res.status_code}: {res.text[:160]}")
        return False

    return False
