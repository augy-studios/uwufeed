"""pause, settings and link. Per guild state, so SQLite rather than Supabase."""

import discord
from discord import app_commands
from discord.ext import commands

import db

PAUSED = "Delivery here is paused. Run the same command again to resume."
RESUMED = "Delivery here is back on."

SETTINGS_PENDING = (
    "Preferences arrive in the next release. Planned: which channel receives posts, "
    "a mention role, quiet hours, and a daily digest instead of instant delivery."
)

LINK_PENDING = "Linking a web account arrives once accounts exist on the site."


class Prefs(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="pause", description="Hold delivery here, run it again to resume")
    @app_commands.guild_only()
    async def pause(self, interaction: discord.Interaction) -> None:
        guild_id = interaction.guild_id
        prefs = db.get_prefs(guild_id)
        now_paused = not bool(prefs["paused"])
        db.set_pref(guild_id, "paused", 1 if now_paused else 0)
        await interaction.response.send_message(
            PAUSED if now_paused else RESUMED, ephemeral=True
        )

    # TODO Phase 5: the dispatcher has to read the paused flag before
    # sending. Until Discord fan out exists, it is stored and unread.

    @app_commands.command(name="settings", description="Channel, quiet hours, digest")
    @app_commands.guild_only()
    async def settings(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(SETTINGS_PENDING, ephemeral=True)

    @app_commands.command(name="link", description="Connect this server to a web account")
    @app_commands.guild_only()
    async def link(self, interaction: discord.Interaction) -> None:
        # TODO Phase 5, depends on Phase 4 auth. Issue a short lived one
        # time code here, the user enters it while signed in on the site,
        # and the resulting user id goes in account_links. That row is a
        # pointer, not a copy of feed data.
        await interaction.response.send_message(LINK_PENDING, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Prefs(bot))
