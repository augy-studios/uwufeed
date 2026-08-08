"""link: connect this chat to a web account.

Until a chat links, it acts as an account of its own with no email and no
password. Linking merges that account into a web one, so the same
subscriptions appear in both places.

The token is signed by the site rather than stored anywhere, so there is
no table to keep and no round trip back to the site to check it.
"""

from telethon import Button, events

import accounts
import config
import feed_store
import linktoken

HOW = (
    "<b>Connect a web account</b>\n\n"
    "Open the app, sign in, and use the connect button there. It opens this "
    "chat with the code already filled in.\n\n"
    "If you have a code, send it here as <code>/link CODE</code>.\n\n"
    "Until then this chat keeps its own set of sources, which is fine if you "
    "only use it here."
)

EXPIRED = (
    "That code is not valid any more. They last ten minutes, so generate a fresh one."
)


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/link(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        parts = (event.raw_text or "").split(maxsplit=1)
        token = parts[1].strip() if len(parts) > 1 else ""

        if not token:
            await event.respond(
                HOW,
                parse_mode="html",
                buttons=[[Button.url("Open the app", config.WEB_APP_URL)]],
                link_preview=False,
            )
            raise events.StopPropagation

        await apply_token(event, token)
        raise events.StopPropagation


async def apply_token(event, token: str) -> None:
    """Shared with /start, which receives the token as a deep link payload."""
    if not config.LINK_TOKEN_SECRET:
        await event.respond("Linking is not configured on this instance.")
        return

    user_id = linktoken.verify(token, config.LINK_TOKEN_SECRET)
    if not user_id:
        await event.respond(EXPIRED)
        return

    existing = accounts.linked_user(event.chat_id)

    if existing == user_id:
        await event.respond("This chat is already connected to that account.")
        return

    moved = {"subscriptions": 0, "targets": 0}
    if existing:
        # Carry whatever this chat already followed into the web account,
        # rather than stranding it on an account nobody can sign into.
        moved = await feed_store.merge_user(existing, user_id)

    accounts.set_user(event.chat_id, user_id)
    await feed_store.ensure_target(user_id, event.chat_id)

    carried = (
        f" {moved['subscriptions']} sources came with it."
        if moved["subscriptions"]
        else ""
    )
    await event.respond(f"Connected.{carried} The app and this chat now share one set.")
