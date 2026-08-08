"""The help command: what this is, every command, and two links.

There is no start command. Everything a new server needs is here.
"""

import discord
from discord import app_commands
from discord.ext import commands

from config import DONATION_URL, WEB_APP_URL
from views import LinkButtons

COMMANDS = [
    ("help", "This message, with every command listed"),
    ("add", "Follow a channel, a blog or a feed"),
    ("list", "Everything this server follows"),
    ("remove", "Stop following one of them"),
    ("pause", "Hold delivery here, run it again to resume"),
    ("latest", "The most recent items, on demand"),
    ("status", "Health of the sources this server follows"),
    ("settings", "Choose the channel that receives posts"),
    ("route", "Send one source only to some destinations"),
    ("link", "Connect this server to a web account"),
]

INTRO = (
    "Follow YouTube channels, blogs and anything with a feed, and the new post lands "
    "in your channel within seconds rather than after a refresh loop. Sources that "
    "support push arrive in about two to ten seconds. Everything else is polled."
)

OUTRO = "Free forever. The same subscriptions work on the web app and in Telegram."


def build_embed() -> discord.Embed:
    embed = discord.Embed(
        title="Push first feed aggregator",
        description=INTRO,
        colour=0xCCFFCC,
    )
    embed.add_field(
        name="Commands",
        value="\n".join(f"`/{name}` {description}" for name, description in COMMANDS),
        inline=False,
    )
    embed.set_footer(text=OUTRO)
    return embed


class Help(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="help", description="What this is and every command")
    async def help_command(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(
            embed=build_embed(),
            view=LinkButtons(WEB_APP_URL, DONATION_URL),
            ephemeral=True,
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Help(bot))
