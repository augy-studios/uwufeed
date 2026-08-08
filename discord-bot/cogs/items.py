"""latest and status."""

from datetime import datetime, timezone

import discord
from discord import app_commands
from discord.ext import commands

import accounts
import db
import feed_store
import text


class Items(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="latest", description="The most recent items, on demand")
    @app_commands.guild_only()
    async def latest(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)

        user_id = accounts.linked_user(interaction.guild_id)
        items = await feed_store.latest_items(user_id, limit=10) if user_id else []
        if not items:
            await interaction.followup.send("Nothing has come in yet.", ephemeral=True)
            return

        embed = discord.Embed(title="Latest", colour=0xCCFFCC)
        embed.description = text.truncate(
            "\n\n".join(
                f"[{text.esc(text.truncate(i.get('title') or 'Untitled', 80))}]({i['url']})"
                if i.get("url")
                else text.esc(text.truncate(i.get("title") or "Untitled", 80))
                for i in items
            ),
            4000,
        )
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="status", description="Health of the sources this server follows")
    @app_commands.guild_only()
    async def status(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)

        user_id = accounts.linked_user(interaction.guild_id)
        sources = await feed_store.subscriptions(user_id) if user_id else []
        if not sources:
            await interaction.followup.send("Nothing followed yet.", ephemeral=True)
            return

        now = datetime.now(timezone.utc)
        live = [s for s in sources if not s.get("retired_at")]
        push = [s for s in live if s.get("tier") == "push"]
        poll = [s for s in live if s.get("tier") == "poll"]
        retired = [s for s in sources if s.get("retired_at")]
        lapsed = [s for s in push if _lapsed(s.get("lease_expires_at"), now)]
        failing = [s for s in live if (s.get("fail_count") or 0) > 0]

        lines = [
            f"{len(push)} arriving within seconds",
            f"{len(poll)} checked on a schedule",
        ]
        if lapsed:
            lines.append(
                f"\n**{len(lapsed)} have a lapsed subscription** and are receiving nothing. "
                "This renews itself nightly, so it should clear on its own."
            )
        if failing:
            lines.append(f"\n{len(failing)} are failing to fetch but have not been given up on.")
        if retired:
            names = ", ".join(
                text.esc(text.truncate(s.get("title") or s["feed_url"], 40)) for s in retired[:5]
            )
            lines.append(
                f"\n**{len(retired)} retired** after repeated failures: {names}. "
                "These stopped on their own rather than stopping posting."
            )
        if not (lapsed or failing or retired):
            lines.append("\nEverything is healthy.")

        if db.get_prefs(interaction.guild_id)["paused"]:
            lines.append("\nDelivery here is **paused**. Run `/pause` again to resume.")

        embed = discord.Embed(title="Source health", colour=0xCCFFCC,
                              description="\n".join(lines))
        await interaction.followup.send(embed=embed, ephemeral=True)


def _lapsed(lease, now) -> bool:
    if not lease:
        return True
    try:
        return datetime.fromisoformat(str(lease).replace("Z", "+00:00")) < now
    except ValueError:
        return True


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Items(bot))
