"""remove: stop following a source.

TODO Phase 3. The work:
  - Take the number shown by list, not a URL. Numbers are easier to type on
    a phone and cannot be mistyped into a different valid source.
  - Delete the uwufeed_subscriptions row only. The uwufeed_sources row is
    shared and stays, because other people are probably following it.
  - Confirm with a persistent button rather than removing on the first tap,
    so a fat finger does not silently drop a subscription.
"""

from telethon import events

PENDING = "Removing sources arrives in the next release."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/remove(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        await event.respond(PENDING)
        raise events.StopPropagation
