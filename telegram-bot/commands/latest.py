"""latest: the most recent items, on demand.

TODO Phase 3. The work:
  - Read the newest items across this chat's subscriptions, capped at ten.
  - Render with the same context the dispatcher uses, so an item looks the
    same whether it was pushed or asked for.
  - Paginate with persistent buttons from buttons.py, so an older message
    still pages correctly after a restart.
"""

from telethon import events

PENDING = "Recent items on demand arrive in the next release."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/latest(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        await event.respond(PENDING)
        raise events.StopPropagation
