"""Who may change what a guild follows.

Anyone can read, only admins can change. One member unfollowing a feed the
whole server relies on is not something to discover later, and there is
nothing to undo it with.
"""

import discord

DENIED = "Only server admins can change what this server follows."


def can_manage(interaction: discord.Interaction) -> bool:
    if interaction.guild is None:
        return False
    perms = interaction.user.guild_permissions
    return bool(perms.administrator or perms.manage_guild)


async def require_manage(interaction: discord.Interaction) -> bool:
    """Answer and return False when the caller may not change things."""
    if can_manage(interaction):
        return True
    await interaction.response.send_message(DENIED, ephemeral=True)
    return False
