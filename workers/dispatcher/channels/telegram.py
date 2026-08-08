"""Telegram delivery through sendMessage.

The bot's own token, used directly by the dispatcher rather than routed
through the bot process. Two processes, one token, same machine.
"""

import asyncio
import os

import httpx

from ..ratelimit import TELEGRAM_GLOBAL
from ..templates import RenderContext, headline, summary_for

API = "https://api.telegram.org"

KIND_PREFIX = {"video": "New video", "article": "New post", "post": "New post",
               "stream": "Live now"}


def esc(value) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def build_message(ctx: RenderContext) -> str:
    """HTML rather than Markdown: feed titles are full of characters
    Markdown treats as syntax, and Telegram rejects the whole message
    rather than escaping them."""
    prefix = KIND_PREFIX.get(ctx.kind, "New post")
    title = esc(ctx.title)
    head = f'<a href="{esc(ctx.url)}">{title}</a>' if ctx.url else f"<b>{title}</b>"

    lines = [f"<b>{esc(prefix)} from {esc(ctx.source_name)}</b>", head]
    body = summary_for(ctx, limit=280)
    if body:
        lines.append(esc(body))
    return "\n\n".join(lines)


async def send(client: httpx.AsyncClient, chat_id: str, ctx: RenderContext) -> bool:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        print("telegram delivery skipped: TELEGRAM_BOT_TOKEN is unset")
        return False

    payload = {
        "chat_id": chat_id,
        "text": build_message(ctx),
        "parse_mode": "HTML",
        "link_preview_options": {"is_disabled": False},
    }

    for attempt in range(3):
        await TELEGRAM_GLOBAL.take()
        try:
            res = await client.post(
                f"{API}/bot{token}/sendMessage", json=payload, timeout=20.0
            )
        except httpx.HTTPError as err:
            print(f"telegram transport error: {type(err).__name__}")
            await asyncio.sleep(2 ** attempt)
            continue

        if res.status_code == 200:
            return True

        # Telegram says exactly how long to wait, so honour it rather than
        # guessing with the local bucket.
        if res.status_code == 429:
            retry_after = 1.0
            try:
                retry_after = float(res.json()["parameters"]["retry_after"])
            except Exception:
                pass
            await asyncio.sleep(min(retry_after, 60.0))
            continue

        # 403 is the user blocking the bot, 400 with "chat not found" is a
        # deleted chat. Both are permanent, so stop rather than retrying
        # this message forever.
        if res.status_code in (400, 403):
            print(f"telegram rejected chat {chat_id}: {res.text[:160]}")
            return False

        if 500 <= res.status_code < 600:
            await asyncio.sleep(2 ** attempt)
            continue

        print(f"telegram error {res.status_code}: {res.text[:160]}")
        return False

    return False


def is_permanent_failure(status: int) -> bool:
    """A target worth deactivating rather than retrying."""
    return status in (400, 403)
