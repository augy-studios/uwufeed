"""Who may change what a chat follows.

In a group, anyone can read and only admins can change. One member
unfollowing a feed the whole group relies on is not something to discover
later, and there is nothing to undo it with.

A private chat has one member, so there is nothing to guard.
"""

DENIED = "Only admins can change what this chat follows."


async def can_manage(event) -> bool:
    if event.is_private:
        return True
    try:
        perms = await event.client.get_permissions(event.chat_id, event.sender_id)
    except Exception:
        # An anonymous admin, a channel post, or a chat the bot cannot read
        # membership for. Refusing is the safe direction.
        return False
    return bool(getattr(perms, "is_admin", False) or getattr(perms, "is_creator", False))


async def require_manage(event) -> bool:
    """Answer and return False when the sender may not change things."""
    if await can_manage(event):
        return True
    await event.respond(DENIED)
    return False
