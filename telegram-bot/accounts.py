"""Which uwuFeed account a chat acts as.

The mapping lives in SQLite, which is the one Supabase identifier the bot
stores locally. It is a pointer, not a copy of feed data.
"""

import db
import feed_store


def linked_user(chat_id: int) -> str | None:
    with db.connect() as conn:
        row = conn.execute(
            "select user_id from account_links where chat_id = ?", (chat_id,)
        ).fetchone()
    return row["user_id"] if row else None


def set_user(chat_id: int, user_id: str) -> None:
    with db.connect() as conn:
        conn.execute(
            "insert into account_links (chat_id, user_id) values (?, ?) "
            "on conflict(chat_id) do update set user_id = excluded.user_id, "
            "linked_at = datetime('now')",
            (chat_id, user_id),
        )


async def ensure_user(chat_id: int, display_name: str | None = None) -> str:
    """The account this chat acts as, creating one on first use.

    A chat account has no email and no password, so it cannot be signed
    into on the web. /link merges it into a real account later.
    """
    existing = linked_user(chat_id)
    if existing:
        # The row could point at an account deleted elsewhere, in which case
        # a stale pointer would break every command with a foreign key
        # error. Cheaper to check than to explain.
        if await feed_store.user_exists(existing):
            return existing

    user_id = await feed_store.create_chat_user(chat_id, display_name)
    set_user(chat_id, user_id)
    await feed_store.ensure_target(user_id, chat_id)
    return user_id
