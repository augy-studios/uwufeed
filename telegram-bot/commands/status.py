"""status: health of the sources this chat follows.

The failures worth surfacing are the silent ones. A lapsed push lease and
a retired source both look exactly like a channel that stopped posting,
and only the system knows the difference.
"""

from datetime import datetime, timezone

from telethon import events

import accounts
import db
import feed_store
import text


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/status(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        user_id = accounts.linked_user(event.chat_id)
        if not user_id:
            await event.respond("Nothing followed yet.")
            raise events.StopPropagation

        sources = await feed_store.subscriptions(user_id)
        if not sources:
            await event.respond("Nothing followed yet.")
            raise events.StopPropagation

        now = datetime.now(timezone.utc)
        push = [s for s in sources if s.get("tier") == "push" and not s.get("retired_at")]
        poll = [s for s in sources if s.get("tier") == "poll" and not s.get("retired_at")]
        retired = [s for s in sources if s.get("retired_at")]
        lapsed = [s for s in push if _lapsed(s.get("lease_expires_at"), now)]
        failing = [s for s in sources if (s.get("fail_count") or 0) > 0 and not s.get("retired_at")]

        prefs = db.get_prefs(event.chat_id)

        lines = [
            "<b>Source health</b>",
            "",
            f"{len(push)} arriving within seconds",
            f"{len(poll)} checked on a schedule",
        ]

        if lapsed:
            lines.append(
                f"\n<b>{len(lapsed)} push sources have a lapsed subscription</b> and are "
                "receiving nothing. This renews itself nightly, so it should clear on its own."
            )
        if failing:
            lines.append(f"\n{len(failing)} are failing to fetch but have not been given up on.")
        if retired:
            names = ", ".join(
                text.esc(text.truncate(s.get("title") or s["feed_url"], 40)) for s in retired[:5]
            )
            lines.append(
                f"\n<b>{len(retired)} retired</b> after repeated failures: {names}. "
                "These stopped on their own rather than stopping posting."
            )
        if not (lapsed or failing or retired):
            lines.append("\nEverything is healthy.")

        if prefs["paused"]:
            lines.append("\nDelivery here is <b>paused</b>. Run /pause again to resume.")

        await event.respond("\n".join(lines), parse_mode="html", link_preview=False)
        raise events.StopPropagation


def _lapsed(lease, now) -> bool:
    if not lease:
        return True
    try:
        return datetime.fromisoformat(str(lease).replace("Z", "+00:00")) < now
    except ValueError:
        return True
