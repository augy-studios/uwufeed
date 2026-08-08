"""add, list and remove."""

import discord
from discord import app_commands
from discord.ext import commands

import accounts
import config
import feed_store
import permissions
import text

ERRORS = {
    "no_feed_found": "No feed there. That page does not publish one that can be found.",
    "fetch_failed": "That site could not be reached.",
    "feed_fetch_failed": "The feed was found but could not be read.",
    "invalid_url": "That does not look like a link.",
    "unsupported_scheme": "Only http and https links work.",
}


class Sources(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="add", description="Follow a channel, a blog or a feed")
    @app_commands.describe(url="Link to a channel, a blog, a subreddit or a feed")
    @app_commands.guild_only()
    async def add(self, interaction: discord.Interaction, url: str) -> None:
        if not await permissions.require_manage(interaction):
            return
        if not (config.PUBLIC_BASE_URL and config.ADMIN_TOKEN):
            await interaction.response.send_message(
                "Adding sources is not configured on this instance.", ephemeral=True
            )
            return

        # Resolution involves one or two outbound fetches, which comfortably
        # exceeds the three seconds Discord allows before it gives up.
        await interaction.response.defer(ephemeral=True)

        user_id = await accounts.ensure_user(interaction.guild_id, interaction.guild.name)

        if await feed_store.count_subscriptions(user_id) >= config.MAX_SOURCES_PER_USER:
            await interaction.followup.send(
                f"This server is at the limit of {config.MAX_SOURCES_PER_USER} sources. "
                "Remove one first.",
                ephemeral=True,
            )
            return

        result = await feed_store.resolve_source(url)
        if result.get("error"):
            await interaction.followup.send(
                ERRORS.get(result["error"], "That could not be added."), ephemeral=True
            )
            return

        source = result["source"]
        added = await feed_store.subscribe(user_id, source["id"], interaction.guild.name)
        title = source.get("title") or source["feed_url"]

        if not added:
            await interaction.followup.send(f"Already following **{title}**.", ephemeral=True)
            return

        # Say what the tier means rather than naming it. A person cares how
        # fast it arrives, not which queue it sits in.
        speed = (
            "New posts arrive within seconds."
            if source["tier"] == "push"
            else "This one is checked regularly, so posts arrive within the hour."
        )
        where = (
            "It goes to every destination this server has. Use `/route` to narrow it."
        )
        await interaction.followup.send(
            f"Following **{title}**\n{speed}\n{where}", ephemeral=True
        )

    @app_commands.command(name="list", description="Everything this server follows")
    @app_commands.guild_only()
    async def list_sources(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)

        user_id = accounts.linked_user(interaction.guild_id)
        sources = await feed_store.subscriptions(user_id) if user_id else []
        if not sources:
            await interaction.followup.send(
                "Nothing followed yet. Use `/add` with a link to start.", ephemeral=True
            )
            return

        embed = discord.Embed(title=f"Following {len(sources)}", colour=0xCCFFCC)
        body = "\n".join(
            f"{i}. **{text.esc(text.truncate(s.get('title') or s['feed_url'], 60))}**"
            f" {'seconds' if s.get('tier') == 'push' else 'hourly'}"
            f"{' (retired)' if s.get('retired_at') else ''}"
            for i, s in enumerate(sources, start=1)
        )
        embed.description = text.truncate(body, 4000)
        embed.set_footer(text="Use /remove with the number to stop following one.")
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="remove", description="Stop following one of them")
    @app_commands.describe(number="The number shown by /list")
    @app_commands.guild_only()
    async def remove(self, interaction: discord.Interaction, number: int) -> None:
        if not await permissions.require_manage(interaction):
            return
        await interaction.response.defer(ephemeral=True)

        user_id = accounts.linked_user(interaction.guild_id)
        sources = await feed_store.subscriptions(user_id) if user_id else []
        if number < 1 or number > len(sources):
            await interaction.followup.send(
                f"There is no {number}. /list shows {len(sources)}.", ephemeral=True
            )
            return

        source = sources[number - 1]
        title = text.esc(text.truncate(source.get("title") or source["feed_url"], 60))
        await feed_store.unsubscribe(user_id, source["id"])

        # The source row stays. It is shared, and other servers are probably
        # still following it.
        await interaction.followup.send(f"Stopped following **{title}**.", ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Sources(bot))
