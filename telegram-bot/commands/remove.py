"""remove: stop following a source.

Takes the number from /list rather than a URL. Numbers are easier to type
on a phone and cannot be mistyped into a different valid source.
"""

import re

from telethon import Button, events

import accounts
import buttons
import feed_store
import permissions
import text

USAGE = "Send the number from /list, like <code>/remove 3</code>."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/remove(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        if not await permissions.require_manage(event):
            raise events.StopPropagation

        match = re.search(r"\d+", event.raw_text or "")
        if not match:
            await event.respond(USAGE, parse_mode="html")
            raise events.StopPropagation

        user_id = accounts.linked_user(event.chat_id)
        if not user_id:
            await event.respond("Nothing followed yet.")
            raise events.StopPropagation

        sources = await feed_store.subscriptions(user_id)
        index = int(match.group(0))
        if index < 1 or index > len(sources):
            await event.respond(f"There is no {index}. /list shows {len(sources)}.")
            raise events.StopPropagation

        source = sources[index - 1]
        title = text.esc(text.truncate(source.get("title") or source["feed_url"], 60))

        # Confirm rather than removing on the first tap. The payload lives
        # in SQLite, so this still works if the chat comes back to it in a
        # month, after a restart or a redeploy.
        data = buttons.register(
            event.chat_id, "remove", {"source_id": source["id"], "title": title}
        )
        await event.respond(
            f"Stop following <b>{title}</b>?",
            parse_mode="html",
            buttons=[[Button.inline("Yes, remove it", data), Button.inline("Keep it", b"cancel")]],
        )
        raise events.StopPropagation


async def on_confirm(event, entry: dict) -> None:
    """Called from the callback router in main.py."""
    if not await permissions.can_manage(event):
        await event.answer(permissions.DENIED, alert=True)
        return

    user_id = accounts.linked_user(event.chat_id)
    if not user_id:
        await event.answer("Nothing to remove.", alert=True)
        return

    payload = entry["payload"]
    await feed_store.unsubscribe(user_id, payload["source_id"])
    buttons.forget(entry["token"])

    # The source row itself stays. It is shared, and other people are
    # probably still following it.
    await event.edit(f"Stopped following <b>{payload['title']}</b>.", parse_mode="html")
