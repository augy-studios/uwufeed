"""Persistent views.

A view survives a restart only if it has no timeout and every component
carries a stable custom_id. The custom_id is a key into SQLite rather than
the payload itself, so the 100 character limit never becomes a constraint
and the state can grow later without breaking old messages.
"""

import secrets

import discord

import db


def new_custom_id(kind: str) -> str:
    return f"uwufeed:{kind}:{secrets.token_urlsafe(8)}"


class PersistentView(discord.ui.View):
    """Base for anything that has to still work next month."""

    def __init__(self, custom_id: str, kind: str) -> None:
        super().__init__(timeout=None)
        self.custom_id = custom_id
        self.kind = kind

    def store(self, payload: dict, *, guild_id=None, channel_id=None, message_id=None) -> None:
        db.save_view(
            self.custom_id,
            self.kind,
            payload,
            guild_id=guild_id,
            channel_id=channel_id,
            message_id=message_id,
        )

    def state(self) -> dict:
        row = db.load_view(self.custom_id)
        return row["payload"] if row else {}


class LinkButtons(discord.ui.View):
    """Link buttons only. Nothing to persist: a URL button never calls back."""

    def __init__(self, web_app_url: str, donation_url: str) -> None:
        super().__init__(timeout=None)
        self.add_item(discord.ui.Button(label="Open the web app", url=web_app_url))
        self.add_item(discord.ui.Button(label="Buy Augy a coffee", url=donation_url))


# Every persistent view class, keyed by the kind stored in SQLite. On
# startup main.py reads the rows and re-registers one instance per kind.
REGISTRY: dict[str, type[PersistentView]] = {}


def register_kind(kind: str):
    def decorator(cls):
        REGISTRY[kind] = cls
        return cls

    return decorator


def restore_all(bot) -> int:
    """Re-register stored views so old messages keep responding.

    Called from on_ready. A view registered here has no message attached;
    Discord routes by custom_id, so the buttons on the original message
    start working again as soon as the class is registered.
    """
    restored = 0
    seen: set[str] = set()

    for row in db.load_views():
        cls = REGISTRY.get(row["kind"])
        if cls is None or row["custom_id"] in seen:
            continue
        bot.add_view(cls(row["custom_id"], row["kind"]))
        seen.add(row["custom_id"])
        restored += 1

    return restored

# TODO Phase 5: the first real persistent views, list paging and remove
# confirmation, register themselves here with @register_kind.
