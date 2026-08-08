"""Persistent inline buttons.

Telegram callback data is limited to 64 bytes and lives forever on the
message. Putting the real payload in SQLite and only a short token on the
button means a callback still works months later, after a restart or a
redeploy, instead of answering with an unhelpful error.
"""

import json
import secrets

import db

PREFIX = "b:"


def register(chat_id: int, kind: str, payload: dict | None = None) -> bytes:
    """Store a payload and return the callback data for the button."""
    token = secrets.token_urlsafe(8)
    with db.connect() as conn:
        conn.execute(
            "insert into buttons (token, chat_id, kind, payload) values (?, ?, ?, ?)",
            (token, chat_id, kind, json.dumps(payload or {})),
        )
    return f"{PREFIX}{token}".encode()


def resolve(data: bytes | str) -> dict | None:
    """Look a callback back up. None means the button is unknown."""
    text = data.decode() if isinstance(data, bytes) else data
    if not text.startswith(PREFIX):
        return None

    token = text[len(PREFIX) :]
    with db.connect() as conn:
        row = conn.execute("select * from buttons where token = ?", (token,)).fetchone()
    if not row:
        return None

    return {"token": row["token"], "chat_id": row["chat_id"], "kind": row["kind"],
            "payload": json.loads(row["payload"])}


def forget(token: str) -> None:
    with db.connect() as conn:
        conn.execute("delete from buttons where token = ?", (token,))


def prune(keep_days: int = 90) -> int:
    """Buttons on very old messages are not worth keeping forever."""
    with db.connect() as conn:
        cur = conn.execute(
            "delete from buttons where created_at < datetime('now', ?)", (f"-{keep_days} days",)
        )
        return cur.rowcount
