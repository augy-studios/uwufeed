"""The start command: what this is, every command, and two links.

There is no help command. Everything a new chat needs is here.

/start also carries the deep link payload used to connect a web account,
because Telegram delivers it as an argument to this command and nowhere
else.
"""

from telethon import Button, events

from config import DONATION_URL, WEB_APP_URL

from . import link

COMMANDS = [
    ("start", "This message, with every command listed"),
    ("add", "Follow a channel, a blog or a feed. Send a link with it"),
    ("list", "Everything this chat follows"),
    ("remove", "Stop following one of them"),
    ("route", "Send one source only to some destinations"),
    ("pause", "Hold delivery here, run it again to resume"),
    ("latest", "The most recent items, on demand"),
    ("status", "Health of the sources this chat follows"),
    ("settings", "Delivery preferences for this chat"),
    ("link", "Connect this chat to a web account"),
]

INTRO = (
    "<b>Push first feed aggregator</b>\n\n"
    "Follow YouTube channels, blogs and anything with a feed, and get the new post "
    "here within seconds rather than waiting on a refresh. Sources that support push "
    "arrive in about two to ten seconds. Everything else is polled, at worst once an hour."
)

OUTRO = (
    "Free forever, with no account needed to start. "
    "Connect a web account with /link and the same sources work everywhere."
)


def render() -> str:
    lines = [INTRO, "", "<b>Commands</b>"]
    lines += [f"/{name} {description}" for name, description in COMMANDS]
    lines += ["", OUTRO]
    return "\n".join(lines)


def keyboard() -> list:
    return [[Button.url("Open the web app", WEB_APP_URL)],
            [Button.url("Buy Augy a coffee", DONATION_URL)]]


def register(client) -> None:
    @client.on(events.NewMessage(pattern=r"^/start(?:@\w+)?(?:\s|$)"))
    async def handler(event) -> None:
        # A deep link from the app arrives as /start <token>. Telegram
        # offers no other way to hand a payload to a bot on first contact.
        parts = (event.raw_text or "").split(maxsplit=1)
        if len(parts) > 1 and parts[1].strip():
            await link.apply_token(event, parts[1].strip())
            raise events.StopPropagation

        await event.respond(render(), parse_mode="html", buttons=keyboard(), link_preview=False)
        raise events.StopPropagation
