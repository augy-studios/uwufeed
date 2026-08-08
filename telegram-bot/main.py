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


async def on_callback(event) -> None:
    """Every inline button goes through here.

    The button carries a token, not a payload, so a callback still resolves
    after a restart or a redeploy. An unknown token means the row was
    pruned, and saying so beats failing silently.
    """
    entry = buttons.resolve(event.data)
    if entry is None:
        await event.answer("That button has expired. Run the command again.", alert=True)
        return

    # TODO Phase 3: dispatch on entry["kind"] once list, remove, latest and
    # settings actually draw buttons.
    await event.answer("Not wired up yet.")


def build_client() -> TelegramClient:
    client = TelegramClient(config.SESSION_NAME, config.API_ID, config.API_HASH)
    commands.register_all(client)
    client.add_event_handler(on_callback, events.CallbackQuery())
    return client


async def main() -> None:
    config.check()
    db.init()

    client = build_client()
    await client.start(bot_token=config.BOT_TOKEN)

    me = await client.get_me()
    print(f"signed in as @{me.username}")
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
