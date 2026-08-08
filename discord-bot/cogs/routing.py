"""route: send a source only to some destinations.

Without this, every destination a server owns receives everything it
follows. That is right for a small server and wrong once there is a gaming
channel and a dev channel.
"""

import discord
from discord import app_commands
from discord.ext import commands

import accounts
import feed_store
import permissions
import text

CHANNEL_LABEL = {"discord": "Discord", "telegram": "Telegram", "webpush": "Browser",
                 "ntfy": "ntfy"}


def describe(target: dict) -> str:
    label = CHANNEL_LABEL.get(target["channel"], target["channel"])
    ref = str(target.get("target_ref") or "")
    if target["channel"] == "discord":
        tail = ref.rsplit("/", 2)[-2][-6:] if "/webhooks/" in ref else ref[-6:]
        return f"{label} webhook {tail}"
    return f"{label} {ref[-6:]}"


class RouteView(discord.ui.View):
    """Ephemeral, so it does not need to survive a restart.

    Persistent views exist for messages that stay in a channel. This one is
    only visible to whoever ran the command and expires with the
    interaction, so storing it would be state nobody reads.
    """

    def __init__(self, subscription_id: int, targets: list[dict], chosen: list[int]) -> None:
        super().__init__(timeout=300)
        self.subscription_id = subscription_id

        options = [
            discord.SelectOption(
                label=text.truncate(describe(t), 90),
                value=str(t["id"]),
                default=t["id"] in chosen,
            )
            for t in targets[:25]
        ]
        self.picker = discord.ui.Select(
            placeholder="Choose destinations, or none for everywhere",
            min_values=0,
            max_values=len(options),
            options=options,
        )
        self.picker.callback = self.on_pick
        self.add_item(self.picker)

    async def on_pick(self, interaction: discord.Interaction) -> None:
        chosen = [int(v) for v in self.picker.values]
        await feed_store.set_routing(self.subscription_id, chosen)
        await interaction.response.edit_message(
            content=(
                "That source now goes **everywhere**."
                if not chosen
                else f"That source now goes to **{len(chosen)}** destination(s)."
            ),
            view=None,
        )


class Routing(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="route", description="Send one source only to some destinations")
    @app_commands.describe(number="The number shown by /list")
    @app_commands.guild_only()
    async def route(self, interaction: discord.Interaction, number: int) -> None:
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

        targets = [t for t in await feed_store.targets(user_id) if t.get("active")]
        if not targets:
            await interaction.followup.send(
                "There is nowhere to send anything yet. Use `/settings channel:#your-channel`.",
                ephemeral=True,
            )
            return

        source = sources[number - 1]
        title = text.esc(text.truncate(source.get("title") or source["feed_url"], 60))
        current = source.get("target_ids") or []
        summary = "everywhere" if not current else f"{len(current)} of {len(targets)}"

        await interaction.followup.send(
            f"**{title}** currently goes to {summary}.\nPick none to send it everywhere.",
            view=RouteView(source["subscription_id"], targets, current),
            ephemeral=True,
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Routing(bot))
