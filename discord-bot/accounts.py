"""Which uwuFeed account a guild acts as.

The mapping lives in SQLite, which is the one Supabase identifier the bot
stores locally. It is a pointer, not a copy of feed data.
"""

import db
import feed_store


def linked_user(guild_id: int) -> str | None:
    with db.connect() as conn:
        row = conn.execute(
            "select user_id from account_links where guild_id = ?", (guild_id,)
        ).fetchone()
    return row["user_id"] if row else None


def set_user(guild_id: int, user_id: str) -> None:
    with db.connect() as conn:
        conn.execute(
            "insert into account_links (guild_id, user_id) values (?, ?) "
            "on conflict(guild_id) do update set user_id = excluded.user_id, "
            "linked_at = datetime('now')",
            (guild_id, user_id),
        )


async def ensure_user(guild_id: int, display_name: str | None = None) -> str:
    """The account this guild acts as, creating one on first use.

    A guild account has no email and no password, so it cannot be signed
    into on the web. /link merges it into a real account later.
    """
    existing = linked_user(guild_id)
    if existing:
        # The row could point at an account deleted elsewhere, in which case
        # a stale pointer would break every command with a foreign key
        # error. Cheaper to check than to explain.
        if await feed_store.user_exists(existing):
            return existing

    user_id = await feed_store.create_guild_user(display_name)
    set_user(guild_id, user_id)
    return user_id
