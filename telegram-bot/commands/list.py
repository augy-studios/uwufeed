"""list: everything this chat follows.

TODO Phase 3. The work:
  - Read uwufeed_subscriptions joined to uwufeed_sources for this chat.
  - Number the rows, since remove takes a number rather than a URL.
  - Show the tier per source, so push and poll are distinguishable.
  - Page it with persistent buttons from buttons.py once a chat passes
    about twenty sources.
"""

from telethon import events

PENDING = "The source list arrives in the next release."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/list(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        await event.respond(PENDING)
        raise events.StopPropagation
