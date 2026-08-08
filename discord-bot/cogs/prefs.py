"""pause, settings and link."""

import discord
from discord import app_commands
from discord.ext import commands

import accounts
import config
import db
import feed_store
import linktoken
import permissions

PAUSED = "Delivery here is paused. Run the same command again to resume."
RESUMED = "Delivery here is back on."

LINK_HOW = (
    "Open the app, sign in, and use the connect button on the Account tab. "
    "It gives you a code to paste here as `/link code:<code>`.\n\n"
    "Until then this server keeps its own set of sources, which is fine if "
    "you only use it here."
)

EXPIRED = "That code is not valid any more. They last ten minutes, so generate a fresh one."


class Prefs(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="settings", description="Choose the channel that receives posts")
    @app_commands.describe(channel="Where new posts should be sent")
    @app_commands.guild_only()
    async def settings(
        self, interaction: discord.Interaction, channel: discord.TextChannel | None = None
    ) -> None:
        if not await permissions.require_manage(interaction):
            return

        if channel is None:
            prefs = db.get_prefs(interaction.guild_id)
            current = f"<#{prefs['channel_id']}>" if prefs["channel_id"] else "not set"
            state = "paused" if prefs["paused"] else "on"
            await interaction.response.send_message(
                f"**Settings for this server**\n\n"
                f"Posts go to: {current}\n"
                f"Delivery: **{state}**, change it with `/pause`\n\n"
                f"Set a channel with `/settings channel:#your-channel`.",
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True)

        # A webhook rather than the gateway: friendlier rate limits, and the
        # dispatcher can post without the bot being online at all.
        #
        # Reuse ours if it is already there. Creating a second one would
        # make a second destination pointing at the same channel, and every
        # item would arrive twice.
        try:
            mine = [
                w
                for w in await channel.webhooks()
                if w.name == config.WEBHOOK_NAME
                and w.user is not None
                and w.user.id == interaction.client.user.id
            ]
            webhook = mine[0] if mine else await channel.create_webhook(name=config.WEBHOOK_NAME)
        except discord.Forbidden:
            await interaction.followup.send(
                "I need the Manage Webhooks permission in that channel. Grant it and try again.",
                ephemeral=True,
            )
            return
        except discord.HTTPException as err:
            await interaction.followup.send(f"Discord refused that: {err.text}", ephemeral=True)
            return

        user_id = await accounts.ensure_user(interaction.guild_id, interaction.guild.name)
        await feed_store.ensure_webhook_target(user_id, webhook.url)
        db.set_pref(interaction.guild_id, "channel_id", channel.id)

        await interaction.followup.send(
            f"New posts will go to {channel.mention}.\n"
            "Use `/route` to send only some sources there.",
            ephemeral=True,
        )

    @app_commands.command(name="pause", description="Hold delivery here, run it again to resume")
    @app_commands.guild_only()
    async def pause(self, interaction: discord.Interaction) -> None:
        if not await permissions.require_manage(interaction):
            return
        await interaction.response.defer(ephemeral=True)

        guild_id = interaction.guild_id
        prefs = db.get_prefs(guild_id)
        now_paused = not bool(prefs["paused"])

        # The dispatcher is a different process with a different database,
        # so the flag has to live where it looks: uwufeed_targets.active.
        user_id = accounts.linked_user(guild_id)
        if user_id:
            await feed_store.set_targets_active(user_id, not now_paused)

        db.set_pref(guild_id, "paused", 1 if now_paused else 0)
        await interaction.followup.send(PAUSED if now_paused else RESUMED, ephemeral=True)

    @app_commands.command(name="link", description="Connect this server to a web account")
    @app_commands.describe(code="The code from the app's Account tab")
    @app_commands.guild_only()
    async def link(self, interaction: discord.Interaction, code: str | None = None) -> None:
        if not await permissions.require_manage(interaction):
            return

        if not code:
            await interaction.response.send_message(LINK_HOW, ephemeral=True)
            return

        if not config.LINK_TOKEN_SECRET:
            await interaction.response.send_message(
                "Linking is not configured on this instance.", ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True)

        user_id = linktoken.verify(code.strip(), config.LINK_TOKEN_SECRET)
        if not user_id:
            await interaction.followup.send(EXPIRED, ephemeral=True)
            return

        # The link is to the person who ran it, never to the server. A
        # server is a shared space: merging it into whichever member linked
        # first would hand that member everybody else's feed, and would make
        # a password reset something the whole channel can read.
        await feed_store.set_identity(user_id, interaction.user.id, interaction.user.name)

        await interaction.followup.send(
            "Connected to your account.\n\n"
            "This server keeps its own sources, because they belong to everyone here rather "
            "than to you. What this does is let the app recognise you: your servers appear "
            "there, and a forgotten password can be recovered by direct message.",
            ephemeral=True,
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Prefs(bot))
