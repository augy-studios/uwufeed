"""PostgREST access for the dispatcher.

The VPS could use a direct connection, but the dispatcher's queries are a
handful of small reads and writes, so REST keeps it to one dependency.
"""

import os

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

_HEADERS = {
    "apikey": SERVICE_KEY,
    "authorization": f"Bearer {SERVICE_KEY}",
    "content-type": "application/json",
}


def _client() -> httpx.AsyncClient:
    if not SUPABASE_URL or not SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
    return httpx.AsyncClient(
        base_url=f"{SUPABASE_URL}/rest/v1",
        headers=_HEADERS,
        timeout=httpx.Timeout(15.0),
    )


async def ensure_system_target(webhook_url: str) -> int:
    """The Phase 1 Discord webhook, as a real uwufeed_targets row.

    Giving it a row rather than special casing it means deliveries are
    recorded the normal way, so the composite primary key stops a restart
    from re-sending.
    """
    async with _client() as client:
        found = await client.get(
            "/uwufeed_targets",
            params={
                "channel": "eq.discord",
                "target_ref": f"eq.{webhook_url}",
                "user_id": "is.null",
                "select": "id",
                "limit": "1",
            },
        )
        found.raise_for_status()
        rows = found.json()
        if rows:
            return int(rows[0]["id"])

        created = await client.post(
            "/uwufeed_targets",
            headers={"prefer": "return=representation"},
            json=[{"channel": "discord", "target_ref": webhook_url, "user_id": None}],
        )
        created.raise_for_status()
        return int(created.json()[0]["id"])


async def pending_items(target_id: int, limit: int = 50) -> list[dict]:
    """Items inserted while the dispatcher was down.

    One bounded query at startup, not a sweep. Steady state delivery comes
    from Realtime.
    """
    async with _client() as client:
        res = await client.post(
            "/rpc/uwufeed_pending_deliveries",
            json={"p_target_id": target_id, "p_limit": limit},
        )
        res.raise_for_status()
        return res.json()


async def claim_delivery(item_id: int, target_id: int) -> bool:
    """Insert the delivery row before sending.

    Returns False when the row already existed, which means another
    dispatcher, or this one before a restart, already has it.
    """
    async with _client() as client:
        res = await client.post(
            "/uwufeed_deliveries",
            params={"on_conflict": "item_id,target_id"},
            headers={"prefer": "resolution=ignore-duplicates,return=representation"},
            json=[{"item_id": item_id, "target_id": target_id, "status": "pending"}],
        )
        res.raise_for_status()
        return bool(res.json())


async def mark_delivery(item_id: int, target_id: int, status: str) -> None:
    async with _client() as client:
        res = await client.patch(
            "/uwufeed_deliveries",
            params={"item_id": f"eq.{item_id}", "target_id": f"eq.{target_id}"},
            headers={"prefer": "return=minimal"},
            json={"status": status},
        )
        res.raise_for_status()


async def source_title(source_id: int) -> str | None:
    async with _client() as client:
        res = await client.get(
            "/uwufeed_sources",
            params={"id": f"eq.{source_id}", "select": "title,platform", "limit": "1"},
        )
        res.raise_for_status()
        rows = res.json()
        return rows[0].get("title") if rows else None
