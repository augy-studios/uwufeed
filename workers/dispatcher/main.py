"""Dispatcher: listen for inserts on uwufeed_items and fan out.

Phase 1 delivers to a single Discord webhook from the environment. Fan out
across uwufeed_subscriptions and uwufeed_targets arrives with accounts.

Run from the workers directory:

    python -m dispatcher.main
"""

import asyncio
import os
import signal

import httpx
from dotenv import load_dotenv

from . import store
from .channels import discord
from .templates import context_from_item

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "")

QUEUE: asyncio.Queue = asyncio.Queue(maxsize=1000)


def extract_record(payload) -> dict | None:
    """Pull the new row out of a Realtime payload.

    The exact nesting has moved between releases of the Realtime client, so
    check the shapes rather than trusting one of them.
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


async def deliver(client: httpx.AsyncClient, item: dict, target_id: int) -> None:
    item_id = item.get("id")
    if item_id is None:
        return

    # Claim first. If the row already exists this item is someone else's,
    # or ours from before a restart, and must not be sent twice.
    if not await store.claim_delivery(item_id, target_id):
        return

    title = await store.source_title(item.get("source_id"))
    ctx = context_from_item(item, source_title=title)

    ok = await discord.send(client, WEBHOOK_URL, ctx)
    await store.mark_delivery(item_id, target_id, "sent" if ok else "failed")
    print(f"item {item_id} {'sent' if ok else 'failed'}: {ctx.title[:60]}")


async def worker(target_id: int) -> None:
    async with httpx.AsyncClient() as client:
        while True:
            item = await QUEUE.get()
            try:
                await deliver(client, item, target_id)
            except Exception as err:
                print(f"delivery error on item {item.get('id')}: {err}")
            finally:
                QUEUE.task_done()


async def catch_up(target_id: int) -> None:
    """One bounded query for what arrived while this process was down.

    Not a sweep: it runs once at startup and never again. Steady state
    delivery is Realtime only.
    """
    items = await store.pending_items(target_id)
    if items:
        print(f"catch up: {len(items)} items pending")
    for item in items:
        await QUEUE.put(item)


async def listen(target_id: int) -> None:
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
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    if not WEBHOOK_URL:
        raise SystemExit("DISCORD_WEBHOOK_URL is required")

    target_id = await store.ensure_system_target(WEBHOOK_URL)
    print(f"delivering to target {target_id}")

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass  # Windows

    tasks = [
        asyncio.create_task(worker(target_id)),
        asyncio.create_task(listen(target_id)),
    ]
    await catch_up(target_id)

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
