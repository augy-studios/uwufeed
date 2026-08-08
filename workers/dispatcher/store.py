"""PostgREST access for the dispatcher.

The poller needs real SQL for `for update skip locked`. This one does a
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


async def targets_for_item(item_id: int) -> list[dict]:
    """Everyone who should receive this item.

    item -> source -> everyone subscribed -> their active targets, minus
    anything already delivered. A target with no owner cannot appear,
    because a subscription needs a user.
    """
    async with _client() as client:
        res = await client.post("/rpc/uwufeed_targets_for_item", json={"p_item_id": item_id})
        res.raise_for_status()
        return res.json()


async def pending_fanout(limit: int = 200) -> list[dict]:
    """What was missed while this process was down.

    One bounded query at startup, not a sweep.
    """
    async with _client() as client:
        res = await client.post("/rpc/uwufeed_pending_fanout", json={"p_limit": limit})
        res.raise_for_status()
        return res.json()


async def in_quiet_hours(target: dict) -> bool:
    """Ask Postgres, not Python.

    A window that wraps midnight plus a timezone plus daylight saving is
    three ways to get this wrong. One implementation, in SQL, used by both
    this check and the release query.
    """
    if not target.get("quiet_from") or not target.get("quiet_to"):
        return False
    async with _client() as client:
        res = await client.post(
            "/rpc/uwufeed_in_quiet_hours",
            json={
                "p_from": target["quiet_from"],
                "p_to": target["quiet_to"],
                "p_tz": target.get("timezone") or "UTC",
            },
        )
        res.raise_for_status()
        return bool(res.json())


async def due_deferred(limit: int = 200) -> list[dict]:
    """Held deliveries whose quiet window has passed."""
    async with _client() as client:
        res = await client.post("/rpc/uwufeed_due_deferred", json={"p_limit": limit})
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


async def deactivate_target(target_id: int) -> None:
    """A blocked bot or a deleted webhook is permanent. Stop trying."""
    async with _client() as client:
        res = await client.patch(
            "/uwufeed_targets",
            params={"id": f"eq.{target_id}"},
            headers={"prefer": "return=minimal"},
            json={"active": False},
        )
        res.raise_for_status()


async def get_item(item_id: int) -> dict | None:
    async with _client() as client:
        res = await client.get(
            "/uwufeed_items", params={"id": f"eq.{item_id}", "select": "*", "limit": "1"}
        )
        res.raise_for_status()
        rows = res.json()
        return rows[0] if rows else None


async def source_title(source_id: int) -> str | None:
    async with _client() as client:
        res = await client.get(
            "/uwufeed_sources",
            params={"id": f"eq.{source_id}", "select": "title,platform", "limit": "1"},
        )
        res.raise_for_status()
        rows = res.json()
        return rows[0].get("title") if rows else None
