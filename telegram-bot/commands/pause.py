"""pause: hold delivery in this chat, run it again to resume.

The flag is written to uwufeed_targets.active, because the dispatcher is a
different process with a different database and that is where it looks. It
is mirrored into SQLite so /status can answer without a round trip.

Subscriptions are untouched: pausing is this chat going quiet, not
unfollowing anything.
"""

from telethon import events

import accounts
import db
import feed_store
import permissions

PAUSED = "Delivery here is paused. Run the same command again to resume."
RESUMED = "Delivery here is back on."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/pause(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        if not await permissions.require_manage(event):
            raise events.StopPropagation

        chat_id = event.chat_id
        prefs = db.get_prefs(chat_id)
        now_paused = not bool(prefs["paused"])

        user_id = accounts.linked_user(chat_id)
        if user_id:
            await feed_store.set_target_active(user_id, chat_id, not now_paused)

        db.set_pref(chat_id, "paused", 1 if now_paused else 0)
        await event.respond(PAUSED if now_paused else RESUMED)
        raise events.StopPropagation
