"""Discord webhook delivery.

Webhooks rather than the bot gateway: friendlier rate limits, and the
bottleneck at scale is Discord's API rather than anything local.
"""

import asyncio

import httpx

from ..errors import PermanentFailure
from ..ratelimit import DISCORD_WEBHOOK
from ..templates import RenderContext, headline, summary_for

KIND_COLOUR = {
    "video": 0xCCFFCC,
    "article": 0xCCCCFF,
    "post": 0xFFFFCC,
    "stream": 0xFFCCCC,
}


def build_embed(ctx: RenderContext) -> dict:
    embed: dict = {
        "title": ctx.title[:256],
        "color": KIND_COLOUR.get(ctx.kind, KIND_COLOUR["post"]),
        "author": {"name": ctx.source_name[:256]},
        "timestamp": ctx.timestamp_iso,
    }
    if ctx.url:
        embed["url"] = ctx.url
    body = summary_for(ctx, limit=3500 if ctx.kind == "digest" else 300)
    if body:
        embed["description"] = body[:4096]
    if ctx.thumbnail_url:
        embed["image"] = {"url": ctx.thumbnail_url}
    return embed


async def send(client: httpx.AsyncClient, webhook_url: str, ctx: RenderContext) -> bool:
    payload = {"content": f"{headline(ctx)}\n{ctx.url or ''}".strip(), "embeds": [build_embed(ctx)]}

    for attempt in range(3):
        await DISCORD_WEBHOOK.take()
        try:
            res = await client.post(webhook_url, json=payload, timeout=15.0)
        except httpx.HTTPError as err:
            print(f"discord transport error: {err}")
            await asyncio.sleep(2 ** attempt)
            continue

        if res.status_code in (200, 204):
            return True

        # A 429 tells us exactly how long to wait, so honour it rather than
        # guessing with the local bucket.
        if res.status_code == 429:
            retry_after = 1.0
            try:
                retry_after = float(res.json().get("retry_after", 1.0))
            except Exception:
                pass
            await asyncio.sleep(min(retry_after, 30.0))
            continue

        if 500 <= res.status_code < 600:
            await asyncio.sleep(2 ** attempt)
            continue

        # A deleted webhook is gone for good. Retrying it forever costs a
        # request per item and never succeeds.
        if res.status_code in (401, 403, 404):
            raise PermanentFailure(f"discord webhook gone: {res.status_code}")

        print(f"discord rejected the message: {res.status_code} {res.text[:200]}")
        return False

    return False
