"""settings: per chat preferences.

All of these belong to this chat rather than to the account, so they live
in SQLite and never in Supabase.
"""

from telethon import events

import db
import permissions

PLANNED = (
    "\n\nQuiet hours, a daily digest instead of instant delivery, and turning "
    "thumbnails off are all planned."
)


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/settings(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        if not await permissions.require_manage(event):
            raise events.StopPropagation

        prefs = db.get_prefs(event.chat_id)
        state = "paused" if prefs["paused"] else "on"

        await event.respond(
            "<b>Settings for this chat</b>\n\n"
            f"Delivery: <b>{state}</b>, change it with /pause\n"
            f"Format: {prefs['format']}"
            + PLANNED,
            parse_mode="html",
        )
        raise events.StopPropagation
