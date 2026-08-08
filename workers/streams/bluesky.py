"""Bluesky through the Jetstream websocket.

One filtered firehose covers every Bluesky source, however many there are,
so the thousandth account followed costs nothing beyond a row. That is why
this is cheap where Mastodon streaming would not be.

Run from the workers directory:

    python -m streams.bluesky
"""

import asyncio
import json
import os
import signal
from datetime import datetime, timezone

import httpx
import websockets
from dotenv import load_dotenv

load_dotenv()

JETSTREAM = os.environ.get(
    "BLUESKY_JETSTREAM_URL", "wss://jetstream2.us-east.bsky.network/subscribe"
)
COLLECTION = "app.bsky.feed.post"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# How often to re-read which accounts are followed. New sources should
# start arriving without a restart, and this is cheap.
REFRESH_SECONDS = 300

# Jetstream caps how many wantedDids a single connection accepts. Past this
# the filter has to be dropped and the firehose filtered locally, which is
# far more bandwidth, so it is worth knowing when it happens.
MAX_WANTED_DIDS = 10_000


def rest() -> httpx.AsyncClient:
    if not SUPABASE_URL or not SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
    return httpx.AsyncClient(
        base_url=f"{SUPABASE_URL}/rest/v1",
        headers={
            "apikey": SERVICE_KEY,
            "authorization": f"Bearer {SERVICE_KEY}",
            "content-type": "application/json",
        },
        timeout=httpx.Timeout(15.0),
    )


async def load_sources() -> dict[str, dict]:
    """Bluesky sources, keyed by DID. external_ref holds the DID."""
    async with rest() as client:
        res = await client.get(
            "/uwufeed_sources",
            params={
                "platform": "eq.bluesky",
                "retired_at": "is.null",
                "external_ref": "not.is.null",
                "select": "id,title,external_ref,feed_url",
            },
        )
        res.raise_for_status()
        return {row["external_ref"]: row for row in res.json()}


async def insert_item(row: dict) -> None:
    async with rest() as client:
        res = await client.post(
            "/uwufeed_items",
            params={"on_conflict": "source_id,external_id"},
            headers={"prefer": "resolution=ignore-duplicates,return=minimal"},
            json=[row],
        )
        res.raise_for_status()


def to_item(source: dict, did: str, commit: dict) -> dict | None:
    record = commit.get("record") or {}
    rkey = commit.get("rkey")
    if not rkey:
        return None

    # Replies and reposts flood every subscriber when one followed account
    # is having a conversation. Only original posts go through.
    if record.get("reply"):
        return None

    body = (record.get("text") or "").strip()
    created = record.get("createdAt")
    try:
        published = (
            datetime.fromisoformat(str(created).replace("Z", "+00:00"))
            .astimezone(timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%SZ")
        )
    except (ValueError, TypeError):
        published = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    handle = (source.get("feed_url") or "").rsplit("/", 1)[-1] or did

    return {
        "source_id": source["id"],
        # The AT URI, which is stable for the life of the post.
        "external_id": f"at://{did}/{COLLECTION}/{rkey}",
        "title": body[:200] if body else "New post",
        "url": f"https://bsky.app/profile/{handle}/post/{rkey}",
        "author": source.get("title") or handle,
        "summary": body[:500] or None,
        "thumbnail_url": None,
        "published_at": published,
        "kind": "post",
    }


async def run(stop: asyncio.Event) -> None:
    sources = await load_sources()
    last_refresh = asyncio.get_running_loop().time()

    if not sources:
        print("no bluesky sources, idling")

    if len(sources) > MAX_WANTED_DIDS:
        print(f"warning: {len(sources)} bluesky sources exceeds the wantedDids limit")

    params = [f"wantedCollections={COLLECTION}"]
    params += [f"wantedDids={did}" for did in list(sources)[:MAX_WANTED_DIDS]]
    url = f"{JETSTREAM}?{'&'.join(params)}"

    async with websockets.connect(url, ping_interval=20, max_size=2**20) as socket:
        print(f"jetstream connected, following {len(sources)} accounts")
        while not stop.is_set():
            try:
                raw = await asyncio.wait_for(socket.recv(), timeout=30)
            except asyncio.TimeoutError:
                continue

            now = asyncio.get_running_loop().time()
            if now - last_refresh > REFRESH_SECONDS:
                # A changed source list needs a new filter, which needs a
                # new connection. Returning reconnects with it.
                refreshed = await load_sources()
                if set(refreshed) != set(sources):
                    print("bluesky source list changed, reconnecting")
                    return
                last_refresh = now

            try:
                event = json.loads(raw)
            except (TypeError, ValueError):
                continue

            if event.get("kind") != "commit":
                continue
            commit = event.get("commit") or {}
            if commit.get("operation") != "create":
                continue

            did = event.get("did")
            source = sources.get(did)
            if not source:
                continue

            item = to_item(source, did, commit)
            if item is None:
                continue
            try:
                await insert_item(item)
                print(f"bluesky post from {item['author']}")
            except Exception as err:
                print(f"bluesky insert failed: {type(err).__name__}: {err}")


async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass  # Windows

    delay = 1
    while not stop.is_set():
        try:
            await run(stop)
            delay = 1
        except Exception as err:
            print(f"jetstream dropped: {type(err).__name__}: {err}")
            # Backoff with a ceiling. Jetstream drops connections routinely
            # and does not treat it as an error, so neither should this.
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)

    print("bluesky listener stopped")


if __name__ == "__main__":
    asyncio.run(main())
