"""The poll tier. Everything without a hub ends up here.

Claim a batch, fetch conditionally, normalize, insert with the conflict
handled by the database, reschedule.

Run from the workers directory:

    python -m poller.main
"""

import asyncio
import os
import signal

import httpx
from dotenv import load_dotenv

import alerts

from . import backoff, conditional, db
from .adapters import parse_body

load_dotenv()

BATCH_SIZE = int(os.environ.get("POLLER_BATCH_SIZE", "50"))
CONCURRENCY = int(os.environ.get("POLLER_CONCURRENCY", "10"))

# How long a claimed source stays out of the queue. If this process dies
# mid fetch, that source is retried this many seconds later rather than
# being lost or stuck.
CLAIM_LEASE_SECONDS = 300

IDLE_SLEEP_SECONDS = 5


async def handle_source(pool, client: httpx.AsyncClient, source: dict) -> None:
    source_id = source["id"]
    current = source.get("poll_interval_s") or backoff.FLOOR_SECONDS
    fail_count = source.get("fail_count") or 0

    result = await conditional.fetch(client, source)

    if not result.ok:
        # An RSSHub route that broke is not this source dying. Counted as a
        # failure it retires a healthy subscription because somebody else's
        # scraper changed, so it is reported and left alone.
        if result.route_failure:
            await db.reschedule(
                pool,
                source_id,
                interval=backoff.failure_interval(current),
                etag=source.get("etag"),
                last_modified=source.get("last_modified"),
                fail_count=fail_count,
            )
            await alerts.alert(
                "An RSSHub route stopped working",
                [
                    f"`{source['feed_url']}` answered {result.status}.",
                    "The source is untouched. RSSHub routes break when the sites they "
                    "scrape change, and this would otherwise retire a healthy subscription.",
                ],
            )
            return

        # 410 Gone is the publisher saying so outright. Waiting for twenty
        # failures is twenty pointless requests.
        failures = backoff.RETIRE_AFTER_FAILURES if result.gone else fail_count + 1

        if backoff.should_retire(failures):
            subscribers = await db.retire(pool, source_id, failures)
            reason = "the feed is gone" if result.gone else f"{failures} consecutive failures"
            print(f"retired source {source_id} after {reason}: {source['feed_url']}")
            # Say it. A retired source that goes quiet is indistinguishable
            # from a channel that stopped posting, and only we know which.
            await alerts.alert(
                "A source was retired",
                [
                    f"**{source.get('title') or source['feed_url']}**",
                    f"Reason: {reason}.",
                    f"{subscribers} subscriber(s) will stop receiving it.",
                ],
            )
            return

        await db.reschedule(
            pool,
            source_id,
            interval=backoff.failure_interval(current),
            etag=source.get("etag"),
            last_modified=source.get("last_modified"),
            fail_count=failures,
        )
        print(f"source {source_id} failed ({failures}): {result.error}")
        return

    found = 0
    if not result.not_modified:
        try:
            rows = parse_body(result.body, source)
            found = await db.insert_items(pool, rows)
        except Exception as err:
            # A parse or insert failure is this source's problem, not the
            # batch's. Count it and move on.
            await db.reschedule(
                pool,
                source_id,
                interval=backoff.failure_interval(current),
                etag=source.get("etag"),
                last_modified=source.get("last_modified"),
                fail_count=fail_count + 1,
            )
            print(f"source {source_id} parse failed: {type(err).__name__}: {err}")
            return

    await db.reschedule(
        pool,
        source_id,
        interval=backoff.next_interval(current, found=found, not_modified=result.not_modified),
        etag=result.etag,
        last_modified=result.last_modified,
        # A success resets the counter. The plan counts consecutive
        # failures, not lifetime ones.
        fail_count=0,
    )

    if found:
        print(f"source {source_id}: {found} new")


async def run_batch(pool, client: httpx.AsyncClient, semaphore: asyncio.Semaphore) -> int:
    claimed = await db.claim_due(pool, BATCH_SIZE, CLAIM_LEASE_SECONDS)
    if not claimed:
        return 0

    async def guarded(source):
        async with semaphore:
            try:
                await handle_source(pool, client, source)
            except Exception as err:
                print(f"source {source.get('id')} unhandled: {type(err).__name__}: {err}")

    await asyncio.gather(*(guarded(source) for source in claimed))
    return len(claimed)


async def main() -> None:
    pool = db.make_pool()
    await pool.open()

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass  # Windows

    semaphore = asyncio.Semaphore(CONCURRENCY)
    print(f"polling, batch {BATCH_SIZE}, concurrency {CONCURRENCY}")

    try:
        async with httpx.AsyncClient() as client:
            while not stop.is_set():
                handled = await run_batch(pool, client, semaphore)
                if handled == 0:
                    # Nothing due. Wait, but wake immediately on shutdown.
                    try:
                        await asyncio.wait_for(stop.wait(), timeout=IDLE_SLEEP_SECONDS)
                    except asyncio.TimeoutError:
                        pass
    finally:
        await pool.close()
        print("poller stopped")


if __name__ == "__main__":
    asyncio.run(main())
