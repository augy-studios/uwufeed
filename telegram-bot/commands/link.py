"""link: connect this chat to a web account.

Without it a chat and a web account are two unrelated identities, and the
same channel followed in both places is followed twice.

TODO Phase 3, and it depends on Phase 4 auth existing. The work:
  - Issue a short lived one time code here.
  - The user enters it while signed in on the web app.
  - Store the resulting user id in the account_links table, which is the
    one place a Supabase id is allowed to sit in SQLite. It is a pointer,
    not a copy of feed data.
  - Codes expire in ten minutes and are single use.
"""

from telethon import events

PENDING = "Linking a web account arrives once accounts exist on the site."


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/link(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        await event.respond(PENDING)
        raise events.StopPropagation
