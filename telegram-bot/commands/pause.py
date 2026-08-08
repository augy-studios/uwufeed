"""pause: hold delivery in this chat, run it again to resume.

The paused flag is chat local state, so it lives in SQLite rather than in
Supabase. Subscriptions are untouched: pausing is about this chat being
quiet, not about unfollowing anything.
"""

from telethon import events

import db

PAUSED = "Delivery here is paused. Run the same command again to resume."
RESUMED = "Delivery here is back on."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/pause(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        chat_id = event.chat_id
        prefs = db.get_prefs(chat_id)
        now_paused = not bool(prefs["paused"])
        db.set_pref(chat_id, "paused", 1 if now_paused else 0)
        await event.respond(PAUSED if now_paused else RESUMED)
        raise events.StopPropagation

    # TODO Phase 3: the dispatcher has to read this flag before sending.
    # Until Telegram delivery exists, the flag is stored and nothing reads it.
