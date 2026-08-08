"""add: follow a channel, a blog or a feed."""

import re

from telethon import events

import accounts
import config
import feed_store
import permissions

URL_PATTERN = re.compile(r"https?://\S+")

USAGE = (
    "Send a link with it, like this:\n"
    "<code>/add https://www.youtube.com/@somechannel</code>\n\n"
    "A channel page, a blog, a subreddit or a feed all work. "
    "You do not need to find the feed link yourself."
)

ERRORS = {
    "no_feed_found": "No feed there. That page does not publish one that can be found.",
    "fetch_failed": "That site could not be reached.",
    "feed_fetch_failed": "The feed was found but could not be read.",
    "invalid_url": "That does not look like a link.",
    "unsupported_scheme": "Only http and https links work.",
}


def _where(event) -> str | None:
    """A label for where a source was added, kept for provenance.

    A merge deletes the account a row came from, so this is denormalised on
    purpose: it has to survive that deletion to be worth anything.
    """
    if event.is_private:
        return "Telegram, direct message"
    title = getattr(getattr(event, "chat", None), "title", None)
    return f"Telegram, {title}" if title else "Telegram group"


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/add(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        if not await permissions.require_manage(event):
            raise events.StopPropagation

        match = URL_PATTERN.search(event.raw_text or "")
        if not match:
            await event.respond(USAGE, parse_mode="html", link_preview=False)
            raise events.StopPropagation

        if not (config.PUBLIC_BASE_URL and config.ADMIN_TOKEN):
            await event.respond("Adding sources is not configured on this instance.")
            raise events.StopPropagation

        await event.respond("Looking that up...")

        user_id = await accounts.ensure_user(event.chat_id, await _chat_name(event))

        if await feed_store.count_subscriptions(user_id) >= config.MAX_SOURCES_PER_USER:
            await event.respond(
                f"This chat is at the limit of {config.MAX_SOURCES_PER_USER} sources. "
                "Remove one first."
            )
            raise events.StopPropagation

        result = await feed_store.resolve_source(match.group(0))
        if result.get("error"):
            await event.respond(ERRORS.get(result["error"], "That could not be added."))
            raise events.StopPropagation

        source = result["source"]
        added = await feed_store.subscribe(user_id, source["id"], _where(event))

        if not added:
            await event.respond(f"Already following <b>{_esc(source['title'])}</b>.",
                                parse_mode="html")
            raise events.StopPropagation

        # Say what the tier means rather than naming it. A user cares about
        # how fast it arrives, not which queue it is in.
        speed = (
            "New posts arrive here within seconds."
            if source["tier"] == "push"
            else "This one gets checked regularly, so posts arrive within the hour."
        )
        await event.respond(
            f"Following <b>{_esc(source['title'] or source['feed_url'])}</b>\n{speed}",
            parse_mode="html",
            link_preview=False,
        )
        raise events.StopPropagation


async def _chat_name(event) -> str | None:
    try:
        chat = await event.get_chat()
        return getattr(chat, "title", None) or getattr(chat, "first_name", None)
    except Exception:
        return None


def _esc(value) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
