"""Bot local SQLite: button state, per chat preferences, scheduling.

Feed data lives in Supabase and is shared with the site and the Discord
bot. Sources, items and subscriptions are never copied in here.

Table names take no prefix. The prefix rule applies to Postgres only.
"""

import json
import sqlite3
from contextlib import contextmanager

from config import SQLITE_PATH

SCHEMA = """
create table if not exists buttons (
  token      text primary key,
  chat_id    integer not null,
  kind       text not null,
  payload    text not null,
  created_at text not null default (datetime('now'))
);

create index if not exists buttons_chat_idx on buttons (chat_id);

create table if not exists chat_prefs (
  chat_id     integer primary key,
  paused      integer not null default 0,
  digest      integer not null default 0,
  quiet_from  text,
  quiet_to    text,
  format      text not null default 'rich',
  updated_at  text not null default (datetime('now'))
);

create table if not exists schedules (
  id         integer primary key autoincrement,
  chat_id    integer not null,
  kind       text not null,
  run_at     text not null,
  payload    text not null default '{}',
  done       integer not null default 0
);

create index if not exists schedules_due_idx on schedules (run_at) where done = 0;

create table if not exists account_links (
  chat_id    integer primary key,
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


def get_prefs(chat_id: int) -> dict:
    with connect() as conn:
        row = conn.execute("select * from chat_prefs where chat_id = ?", (chat_id,)).fetchone()
        if row:
            return dict(row)
        conn.execute("insert into chat_prefs (chat_id) values (?)", (chat_id,))
        row = conn.execute("select * from chat_prefs where chat_id = ?", (chat_id,)).fetchone()
        return dict(row)


def set_pref(chat_id: int, field: str, value) -> None:
    allowed = {"paused", "digest", "quiet_from", "quiet_to", "format"}
    if field not in allowed:
        raise ValueError(f"unknown preference: {field}")
    get_prefs(chat_id)
    with connect() as conn:
        conn.execute(
            f"update chat_prefs set {field} = ?, updated_at = datetime('now') where chat_id = ?",
            (value, chat_id),
        )


def schedule(chat_id: int, kind: str, run_at: str, payload: dict | None = None) -> int:
    with connect() as conn:
        cur = conn.execute(
            "insert into schedules (chat_id, kind, run_at, payload) values (?, ?, ?, ?)",
            (chat_id, kind, run_at, json.dumps(payload or {})),
        )
        return int(cur.lastrowid)


def due_schedules(now_iso: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "select * from schedules where done = 0 and run_at <= ? order by run_at", (now_iso,)
        ).fetchall()
        return [dict(row) for row in rows]
