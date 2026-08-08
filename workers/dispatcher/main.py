"""Dispatcher: listen for inserts on uwufeed_items and fan out.

An item reaches everyone subscribed to its source, on every active target
they own. Delivery is claimed before it is sent, so a restart cannot
repeat one.

Run from the workers directory:

    python -m dispatcher.main
"""

import asyncio
import os
import signal

import httpx
from dotenv import load_dotenv

from . import store
from .channels import discord, ntfy, telegram, webpush
from .errors import PermanentFailure
from .freshness import is_stale
from .templates import context_from_item, digest_context

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

QUEUE: asyncio.Queue = asyncio.Queue(maxsize=2000)

# Quiet hours end on a clock, so releasing held deliveries is the one part
# of the dispatcher that polls rather than reacts.
RELEASE_INTERVAL_SECONDS = 300

# One sender per channel, all with the same signature.
SENDERS = {
    "discord": discord.send,
    "telegram": telegram.send,
    "webpush": webpush.send,
    "ntfy": ntfy.send,
}


def extract_record(payload) -> dict | None:
    """Pull the new row out of a Realtime payload.

    The exact nesting has moved between releases of the Realtime client, so
    check the shapes rather than trusting one of them. If a release nests
    it somewhere else, the socket stays healthy and delivery stops, which
    is why this is the first place to look when that happens.
    """
    if not isinstance(payload, dict):
        return None
    for candidate in (
        payload.get("record"),
        payload.get("new"),
        (payload.get("data") or {}).get("record"),
        (payload.get("data") or {}).get("new"),
    ):
        if isinstance(candidate, dict) and candidate:
            return candidate
    return None


async def deliver_one(client: httpx.AsyncClient, item: dict, target: dict) -> None:
    item_id = item["id"]
    target_id = target["target_id"] if "target_id" in target else target["id"]

    # Claim first. If the row already exists this one is someone else's, or
    # ours from before a restart, and must not be sent twice.
    if not await store.claim_delivery(item_id, target_id):
        return

    # Quiet hours hold the delivery rather than dropping it. Whether it is
    # still worth sending later depends on the kind, which is decided at
    # release time rather than here.
    if await store.in_quiet_hours(target):
        await store.mark_delivery(item_id, target_id, "deferred")
        return

    await send_to_target(client, item, target, item_id, target_id)


async def send_to_target(
    client: httpx.AsyncClient, item: dict, target: dict, item_id: int, target_id: int
) -> None:
    """The send itself, without the claim. Reused when releasing a deferred
    delivery, whose row already exists."""
    sender = SENDERS.get(target["channel"])
    if sender is None:
        await store.mark_delivery(item_id, target_id, "skipped")
        return

    title = await store.source_title(item.get("source_id"))
    ctx = context_from_item(item, source_title=title)

    try:
        ok = await sender(client, target["target_ref"], ctx)
    except PermanentFailure as err:
        # A dead browser subscription or a blocked bot. Retrying this
        # forever is the wrong answer, so stop sending to it at all.
        await store.mark_delivery(item_id, target_id, "failed")
        await store.deactivate_target(target_id)
        print(f"deactivated {target['channel']} target {target_id}: {err}")
        return

    await store.mark_delivery(item_id, target_id, "sent" if ok else "failed")

    if ok:
        print(f"item {item_id} -> {target['channel']} target {target_id}")


async def fan_out(client: httpx.AsyncClient, item: dict) -> None:
    targets = await store.targets_for_item(item["id"])
    if not targets:
        return
    for target in targets:
        try:
            await deliver_one(client, item, target)
        except Exception as err:
            print(f"delivery error item {item['id']} target {target}: {err}")


async def release_deferred(client: httpx.AsyncClient) -> None:
    """Send what quiet hours held, once the window has passed.

    Anything past its shelf life is marked skipped instead. A stream alert
    released eight hours late would announce something that already ended,
    which is worse than never sending it.
    """
    try:
        due = await store.due_deferred()
    except Exception as err:
        print(f"deferred release query failed: {err}")
        return

    # Group by destination, so a digest target gets one message rather than
    # forty. That is the whole point of a digest, and it needs no separate
    # schedule: the quiet window already decided when to release.
    by_target: dict[int, list[dict]] = {}
    for row in due:
        by_target.setdefault(row["target_id"], []).append(row)

    for target_id, rows in by_target.items():
        fresh = []
        for row in rows:
            item = await store.get_item(row["item_id"])
            if item is None or is_stale(item):
                # A stream alert released eight hours late would announce
                # something that already ended.
                await store.mark_delivery(row["item_id"], target_id, "skipped")
                if item is not None:
                    print(f"item {item['id']} expired while held, not sending")
                continue
            fresh.append((row, item))

        if not fresh:
            continue

        target = rows[0]
        try:
            if target.get("digest") and len(fresh) > 1:
                await send_digest(client, target, target_id, fresh)
            else:
                for row, item in fresh:
                    await send_to_target(client, item, target, row["item_id"], target_id)
        except PermanentFailure as err:
            for row, _ in fresh:
                await store.mark_delivery(row["item_id"], target_id, "failed")
            await store.deactivate_target(target_id)
            print(f"deactivated {target['channel']} target {target_id}: {err}")
        except Exception as err:
            print(f"deferred send failed: {type(err).__name__}: {err}")


async def send_digest(client, target: dict, target_id: int, fresh: list) -> None:
    """One message for everything held, rather than one message each.

    Rendered through the same context the channels already understand, so
    no channel needs a second code path for it.
    """
    sender = SENDERS.get(target["channel"])
    if sender is None:
        for row, _ in fresh:
            await store.mark_delivery(row["item_id"], target_id, "skipped")
        return

    lines = []
    for _, item in fresh[:25]:
        title = (item.get("title") or "Untitled").strip()
        lines.append(f"{title}\n{item.get('url') or ''}".strip())
    if len(fresh) > 25:
        lines.append(f"and {len(fresh) - 25} more")

    ctx = digest_context(len(fresh), "\n\n".join(lines))
    ok = await sender(client, target["target_ref"], ctx)

    for row, _ in fresh:
        await store.mark_delivery(row["item_id"], target_id, "sent" if ok else "failed")
    if ok:
        print(f"digest of {len(fresh)} -> {target['channel']} target {target_id}")


async def release_loop(stop: asyncio.Event) -> None:
    """Quiet hours end on a clock, not on an event, so this is the one place
    the dispatcher works on a timer rather than reacting."""
    async with httpx.AsyncClient() as client:
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=RELEASE_INTERVAL_SECONDS)
                return
            except asyncio.TimeoutError:
                pass
            await release_deferred(client)


async def worker() -> None:
    async with httpx.AsyncClient() as client:
        while True:
            item = await QUEUE.get()
            try:
                await fan_out(client, item)
            except Exception as err:
                print(f"fan out error on item {item.get('id')}: {err}")
            finally:
                QUEUE.task_done()


async def catch_up() -> None:
    """One bounded query for what arrived while this process was down.

    Runs once at startup and never again. Steady state delivery is Realtime
    only, never a sweep of the items table.
    """
    pending = await store.pending_fanout()
    if not pending:
        return

    print(f"catch up: {len(pending)} deliveries pending")
    seen: dict[int, dict] = {}
    for row in pending:
        item = seen.get(row["item_id"])
        if item is None:
            item = await store.get_item(row["item_id"])
            if item is None:
                continue
            seen[row["item_id"]] = item
        await QUEUE.put(item)


async def listen() -> None:
    from realtime import AsyncRealtimeClient

    ws_url = f"{SUPABASE_URL}/realtime/v1".replace("https://", "wss://").replace(
        "http://", "ws://"
    )
    socket = AsyncRealtimeClient(ws_url, SERVICE_KEY, auto_reconnect=True)
    await socket.connect()

    def on_insert(payload) -> None:
        record = extract_record(payload)
        if record is None:
            return
        try:
            QUEUE.put_nowait(record)
        except asyncio.QueueFull:
            print(f"queue full, dropped item {record.get('id')}")

    channel = socket.channel("uwufeed-items")
    await channel.on_postgres_changes(
        "INSERT", schema="public", table="uwufeed_items", callback=on_insert
    ).subscribe()

    print("listening on uwufeed_items inserts")
    await socket.listen()


async def main() -> None:
    if not (SUPABASE_URL and SERVICE_KEY):
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
    if not os.environ.get("TELEGRAM_BOT_TOKEN"):
        print("warning: TELEGRAM_BOT_TOKEN is unset, so Telegram targets cannot be delivered to")

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass  # Windows

    tasks = [
        asyncio.create_task(worker()),
        asyncio.create_task(listen()),
        asyncio.create_task(release_loop(stop)),
    ]
    await catch_up()

    done, pending = await asyncio.wait(
        [*tasks, asyncio.create_task(stop.wait())], return_when=asyncio.FIRST_COMPLETED
    )
    for task in pending:
        task.cancel()
    for task in done:
        if task.exception():
            raise task.exception()


if __name__ == "__main__":
    asyncio.run(main())
