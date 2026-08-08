"""Telegram delivery through sendMessage.

TODO Phase 3. Notes for whoever writes it:
  - Global ceiling is around 30 messages a second, so drain through
    ratelimit.TELEGRAM_GLOBAL rather than firing in parallel.
  - Per chat the limit is far lower, roughly one a second for groups.
  - A 429 carries parameters.retry_after in the response body. Honour it.
  - A 403 means the user blocked the bot: deactivate the target instead of
    retrying forever.
  - Prefer HTML parse mode over Markdown, since feed titles are full of
    characters Markdown treats as syntax.
"""

from ..templates import RenderContext


async def send(client, chat_id: str, ctx: RenderContext) -> bool:
    raise NotImplementedError("telegram delivery arrives in Phase 3")
