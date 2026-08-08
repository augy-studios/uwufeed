"""add: follow a channel, a blog or a feed.

TODO Phase 3. The work:
  - Take the URL from the message, reject anything that is not http or https.
  - Call the same resolution the site uses, so a hub is detected once and
    the source lands in the right tier.
  - Insert a uwufeed_subscriptions row for the linked account, or hold the
    chat id against the source until the chat links an account.
  - Answer with the resolved title and the tier, so it is obvious whether
    this one arrives in seconds or on a poll.
  - Enforce the 50 source cap per free user, and say so plainly when hit.
"""

from telethon import events

PENDING = "Following sources arrives in the next release. Nothing is lost in the meantime."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/add(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        await event.respond(PENDING)
        raise events.StopPropagation
