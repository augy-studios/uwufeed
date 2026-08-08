"""Bot local SQLite: view state, per guild preferences, scheduling.

Feed data lives in Supabase and is shared with the site and the Telegram
bot. Sources, items and subscriptions are never copied in here.

Table names take no prefix. The prefix rule applies to Postgres only.
"""

import json
import sqlite3
from contextlib import contextmanager

from config import SQLITE_PATH

SCHEMA = """
create table if not exists views (
  custom_id  text primary key,
  guild_id   integer,
  channel_id integer,
  message_id integer,
  kind       text not null,
  payload    text not null,
  created_at text not null default (datetime('now'))
);

create index if not exists views_kind_idx on views (kind);

create table if not exists guild_prefs (
  guild_id    integer primary key,
  channel_id  integer,
  mention_role integer,
  paused      integer not null default 0,
  digest      integer not null default 0,
  quiet_from  text,
  quiet_to    text,
  updated_at  text not null default (datetime('now'))
);

create table if not exists schedules (
  id         integer primary key autoincrement,
  guild_id   integer not null,
  kind       text not null,
  run_at     text not null,
  payload    text not null default '{}',
  done       integer not null default 0
);

create index if not exists schedules_due_idx on schedules (run_at) where done = 0;

create table if not exists account_links (
  guild_id   integer primary key,
  user_id    text not null,
  linked_at  text not null default (datetime('now'))
);
"""


@contextmanager
def connect():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def save_view(custom_id: str, kind: str, payload: dict, *, guild_id=None, channel_id=None,
              message_id=None) -> None:
    with connect() as conn:
        conn.execute(
            "insert or replace into views "
            "(custom_id, guild_id, channel_id, message_id, kind, payload) "
            "values (?, ?, ?, ?, ?, ?)",
            (custom_id, guild_id, channel_id, message_id, kind, json.dumps(payload)),
        )


def load_views() -> list[dict]:
    """Every stored view, for re-registering on startup."""
    with connect() as conn:
        rows = conn.execute("select * from views").fetchall()
    return [{**dict(row), "payload": json.loads(row["payload"])} for row in rows]


def load_view(custom_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("select * from views where custom_id = ?", (custom_id,)).fetchone()
    if not row:
        return None
    return {**dict(row), "payload": json.loads(row["payload"])}


def forget_view(custom_id: str) -> None:
    with connect() as conn:
        conn.execute("delete from views where custom_id = ?", (custom_id,))


def get_prefs(guild_id: int) -> dict:
    with connect() as conn:
        row = conn.execute("select * from guild_prefs where guild_id = ?", (guild_id,)).fetchone()
        if row:
            return dict(row)
        conn.execute("insert into guild_prefs (guild_id) values (?)", (guild_id,))
        row = conn.execute("select * from guild_prefs where guild_id = ?", (guild_id,)).fetchone()
        return dict(row)


def set_pref(guild_id: int, field: str, value) -> None:
    allowed = {"channel_id", "mention_role", "paused", "digest", "quiet_from", "quiet_to"}
    if field not in allowed:
        raise ValueError(f"unknown preference: {field}")
    get_prefs(guild_id)
    with connect() as conn:
        conn.execute(
            f"update guild_prefs set {field} = ?, updated_at = datetime('now') where guild_id = ?",
            (value, guild_id),
        )
