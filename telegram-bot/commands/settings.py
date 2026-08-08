"""settings: per chat preferences.

All of these are chat local, so they belong in SQLite and not in Supabase.

TODO Phase 3. Planned settings:
  - Quiet hours, a from and a to. Items arriving inside the window are held
    and sent after it, rather than dropped.
  - Format, rich or plain.
  - Digest instead of instant, one message a day.
  - Whether to include thumbnails.

Rendered as a menu of persistent buttons, so the message still works when
someone scrolls back to it next month.
"""

from telethon import events

PENDING = "Preferences arrive in the next release. Pausing already works."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/settings(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        await event.respond(PENDING)
        raise events.StopPropagation
