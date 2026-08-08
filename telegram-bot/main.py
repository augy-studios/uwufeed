"""Telethon entry point.

Run inside tmux on the VPS:

    python main.py
"""

import asyncio

from telethon import TelegramClient, events

import buttons
import commands
import config
import db
from commands import remove

# Callback kind to handler. A button carries a token, the token resolves to
# a kind, and the kind is dispatched here.
HANDLERS = {"remove": remove.on_confirm}


async def on_callback(event) -> None:
    """Every inline button goes through here.

    The button carries a token rather than a payload, so a callback still
    resolves after a restart or a redeploy. An unknown token means the row
    was pruned, and saying so beats failing silently.
    """
    if event.data == b"cancel":
        await event.edit("Left alone.")
        return

    entry = buttons.resolve(event.data)
    if entry is None:
        await event.answer("That button has expired. Run the command again.", alert=True)
        return

    handler = HANDLERS.get(entry["kind"])
    if handler is None:
        await event.answer("That button is no longer supported.", alert=True)
        return

    try:
        await handler(event, entry)
    except Exception as err:
        print(f"callback {entry['kind']} failed: {type(err).__name__}: {err}")
        await event.answer("That did not work. Try the command again.", alert=True)


def build_client() -> TelegramClient:
    client = TelegramClient(config.SESSION_NAME, config.API_ID, config.API_HASH)
    commands.register_all(client)
    client.add_event_handler(on_callback, events.CallbackQuery())
    return client


async def main() -> None:
    config.check()
    db.init()

    pruned = buttons.prune()
    if pruned:
        print(f"pruned {pruned} expired buttons")

    client = build_client()
    await client.start(bot_token=config.BOT_TOKEN)

    me = await client.get_me()
    print(f"signed in as @{me.username}")
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
