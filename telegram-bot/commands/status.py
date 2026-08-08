"""status: health of the sources this chat follows.

TODO Phase 3. Worth showing, because the interesting failures are all
silent ones:
  - Tier per source, push or poll.
  - For push sources, when the lease expires. A lapsed lease means the
    source went quiet without erroring.
  - For poll sources, when it was last checked and the current interval.
  - Sources retired after repeated failures, and when.
  - Drift: a source returning 200 whose newest item keeps getting older.
"""

from telethon import events

PENDING = "Source health arrives in the next release."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/status(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        await event.respond(PENDING)
        raise events.StopPropagation
