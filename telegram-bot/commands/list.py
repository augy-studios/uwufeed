"""list: everything this chat follows."""

from telethon import events

import accounts
import feed_store
import text

EMPTY = "Nothing followed yet. Send /add with a link to start."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/list(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        # Reading does not create an account. A chat that has never added
        # anything should not get a row just for asking.
        user_id = accounts.linked_user(event.chat_id)
        if not user_id:
            await event.respond(EMPTY)
            raise events.StopPropagation

        sources = await feed_store.subscriptions(user_id)
        if not sources:
            await event.respond(EMPTY)
            raise events.StopPropagation

        lines = [f"<b>Following {len(sources)}</b>", ""]
        lines += [text.source_line(i, s) for i, s in enumerate(sources, start=1)]
        lines += ["", "Use <code>/remove 1</code> with the number to stop following one."]

        await event.respond("\n".join(lines), parse_mode="html", link_preview=False)
        raise events.StopPropagation
