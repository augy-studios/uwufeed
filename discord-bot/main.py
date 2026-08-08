"""discord.py entry point.

Run inside tmux on the VPS:

    python main.py
"""

import asyncio

import discord
from discord.ext import commands

import config
import db
import views
from cogs import EXTENSIONS

# Slash commands only, so no message content intent is needed. Asking for
# one that is not used means a privileged intent review for nothing.
intents = discord.Intents.default()

bot = commands.Bot(command_prefix=commands.when_mentioned, intents=intents, help_command=None)


@bot.event
async def on_ready() -> None:
    restored = views.restore_all(bot)
    print(f"signed in as {bot.user}, {restored} persistent views restored")


async def setup_hook() -> None:
    for extension in EXTENSIONS:
        await bot.load_extension(extension)

    if config.DEV_GUILD_ID:
        guild = discord.Object(id=int(config.DEV_GUILD_ID))
        bot.tree.copy_global_to(guild=guild)
        await bot.tree.sync(guild=guild)
        print(f"commands synced to dev guild {config.DEV_GUILD_ID}")
    else:
        await bot.tree.sync()
        print("commands synced globally, allow up to an hour to appear")


bot.setup_hook = setup_hook


async def main() -> None:
    config.check()
    db.init()
    async with bot:
        await bot.start(config.BOT_TOKEN)


if __name__ == "__main__":
    asyncio.run(main())
