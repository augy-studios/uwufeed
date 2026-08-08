"""The start command: what this is, every command, and two links.

There is no help command. Everything a new chat needs is here.
"""

from telethon import Button, events

from config import DONATION_URL, WEB_APP_URL

COMMANDS = [
    ("start", "This message, with every command listed"),
    ("add", "Follow a channel, a blog or a feed. Send a link with it"),
    ("list", "Everything this chat follows"),
    ("remove", "Stop following one of them"),
    ("pause", "Hold delivery here, run it again to resume"),
    ("latest", "The most recent items, on demand"),
    ("status", "Health of the sources this chat follows"),
    ("settings", "Quiet hours, message format, digest instead of instant"),
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
    "The same subscriptions work on the web app and in Discord."
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
        await event.respond(render(), parse_mode="html", buttons=keyboard(), link_preview=False)
        raise events.StopPropagation
