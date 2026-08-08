"""latest: the most recent items, on demand."""

from telethon import events

import accounts
import feed_store
import text

EMPTY = "Nothing yet. Send /add with a link to follow something."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/latest(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        user_id = accounts.linked_user(event.chat_id)
        if not user_id:
            await event.respond(EMPTY)
            raise events.StopPropagation

        items = await feed_store.latest_items(user_id, limit=10)
        if not items:
            await event.respond("Nothing has come in yet.")
            raise events.StopPropagation

        body = "\n\n".join(text.item_line(item) for item in items)
        await event.respond(
            f"<b>Latest</b>\n\n{body}", parse_mode="html", link_preview=False
        )
        raise events.StopPropagation
