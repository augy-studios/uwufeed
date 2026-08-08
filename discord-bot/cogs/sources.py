"""add, list and remove.

TODO Phase 5. The work:

  add     Take a URL, run the same resolution the site uses so a hub is
          detected once and the source lands in the right tier, then insert
          a uwufeed_subscriptions row. Answer with the resolved title and
          whether it arrives in seconds or on a poll.

  list    Read the subscriptions for this server, numbered, with the tier
          shown. Page it with a persistent view once it passes about
          twenty.

  remove  Take the number list showed. Delete the subscription row only:
          the uwufeed_sources row is shared and other servers are probably
          using it. Confirm through a persistent view rather than removing
          on the first click.
"""

import discord
from discord import app_commands
from discord.ext import commands

PENDING = "This arrives in the next release. Nothing is lost in the meantime."


class Sources(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="add", description="Follow a channel, a blog or a feed")
    @app_commands.describe(url="Link to a channel, a blog or a feed")
    async def add(self, interaction: discord.Interaction, url: str) -> None:
        await interaction.response.send_message(PENDING, ephemeral=True)

    @app_commands.command(name="list", description="Everything this server follows")
    async def list_sources(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(PENDING, ephemeral=True)

    @app_commands.command(name="remove", description="Stop following one of them")
    @app_commands.describe(number="The number shown by the list command")
    async def remove(self, interaction: discord.Interaction, number: int) -> None:
        await interaction.response.send_message(PENDING, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Sources(bot))
