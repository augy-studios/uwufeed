"""latest and status.

TODO Phase 5. The work:

  latest  The newest items across this server's subscriptions, capped at
          ten, rendered from the same context the dispatcher uses so an
          item looks the same whether it was pushed or asked for. Paged
          with a persistent view.

  status  The failures worth seeing are the silent ones: tier per source,
          when a push lease expires, when a polled source was last checked
          and its current interval, anything retired after repeated
          failures, and drift where a source keeps returning 200 while its
          newest item gets older.
"""

import discord
from discord import app_commands
from discord.ext import commands

PENDING = "This arrives in the next release."


class Items(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="latest", description="The most recent items, on demand")
    async def latest(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(PENDING, ephemeral=True)

    @app_commands.command(name="status", description="Health of the sources this server follows")
    async def status(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(PENDING, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Items(bot))
