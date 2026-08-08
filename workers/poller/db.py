"""Direct Postgres access for the poller.

The dispatcher speaks PostgREST because its queries are small. This one
needs `for update skip locked`, which has no REST equivalent, so it uses a
real connection.

Never point this at the transaction pooler. Transaction mode pooling and
row locks do not mix.
"""

import os

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

DSN = os.environ.get("SUPABASE_DB_URL_DIRECT", "")

# Claim and release in one statement. The alternative, holding the
# transaction open across the whole fetch cycle, pins the vacuum horizon
# for as long as the slowest feed in the batch takes to answer.
CLAIM_SQL = """
with due as (
  select id
    from uwufeed_sources
   where tier = 'poll'
     and retired_at is null
     and next_check_at is not null
     and next_check_at <= now()
   order by next_check_at
   limit %(batch)s
   for update skip locked
)
update uwufeed_sources s
   set next_check_at = now() + make_interval(secs => %(lease)s)
  from due
 where s.id = due.id
returning s.*
"""

RESCHEDULE_SQL = """
update uwufeed_sources
   set next_check_at   = now() + make_interval(secs => %(interval)s),
       poll_interval_s = %(interval)s,
       etag            = %(etag)s,
       last_modified   = %(last_modified)s,
       fail_count      = %(fail_count)s
 where id = %(id)s
"""

RETIRE_SQL = """
update uwufeed_sources
   set retired_at      = now(),
       next_check_at   = null,
       last_checked_at = now(),
       fail_count      = %(fail_count)s
 where id = %(id)s
"""

INSERT_ITEM_SQL = """
insert into uwufeed_items
  (source_id, external_id, title, url, author, summary, thumbnail_url, published_at, kind)
values
  (%(source_id)s, %(external_id)s, %(title)s, %(url)s, %(author)s, %(summary)s,
   %(thumbnail_url)s, %(published_at)s, %(kind)s)
on conflict (source_id, external_id) do nothing
"""

SUBSCRIBER_COUNT_SQL = """
select count(*) as subscribers from uwufeed_subscriptions where source_id = %(id)s
"""


def make_pool() -> AsyncConnectionPool:
    if not DSN:
        raise RuntimeError("SUPABASE_DB_URL_DIRECT is required for the poller")
    return AsyncConnectionPool(
        conninfo=DSN,
        min_size=1,
        max_size=5,
        kwargs={"row_factory": dict_row},
        open=False,
    )


async def claim_due(pool, batch: int, lease_seconds: int) -> list[dict]:
    """Take a batch of due sources and push them out of the queue.

    The push forward is the claim. A worker that dies mid fetch leaves the
    source scheduled one lease from now, so it is retried rather than lost,
    and no lock is held while the network is involved.
    """
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(CLAIM_SQL, {"batch": batch, "lease": lease_seconds})
            return await cur.fetchall()


async def reschedule(pool, source_id: int, *, interval: int, etag, last_modified,
                     fail_count: int) -> None:
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                RESCHEDULE_SQL,
                {
                    "id": source_id,
                    "interval": interval,
                    "etag": etag,
                    "last_modified": last_modified,
                    "fail_count": fail_count,
                },
            )


async def retire(pool, source_id: int, fail_count: int) -> int:
    """Retire a dead source and report how many people were following it.

    The count is returned so the caller can say something rather than let
    the source go quiet, which is indistinguishable from a feed that simply
    stopped publishing.
    """
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(SUBSCRIBER_COUNT_SQL, {"id": source_id})
            row = await cur.fetchone()
            await cur.execute(RETIRE_SQL, {"id": source_id, "fail_count": fail_count})
            return int(row["subscribers"]) if row else 0


async def insert_items(pool, rows: list[dict]) -> int:
    """Insert with the conflict handled by Postgres, never by a read first.

    rowcount after executemany is the number actually inserted, since a
    conflicting row contributes nothing.
    """
    if not rows:
        return 0
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.executemany(INSERT_ITEM_SQL, rows)
            return max(cur.rowcount, 0)
