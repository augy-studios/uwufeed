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
from .templates import context_from_item

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

QUEUE: asyncio.Queue = asyncio.Queue(maxsize=2000)

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

    tasks = [asyncio.create_task(worker()), asyncio.create_task(listen())]
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
