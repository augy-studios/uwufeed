"""Feed data in Supabase, shared with the site and the Telegram bot.

Sources, items and subscriptions live in Postgres and are never copied into
SQLite. This module is the only place in the bot that talks to Supabase.
"""

import httpx

import config


def _client() -> httpx.AsyncClient:
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
    return httpx.AsyncClient(
        base_url=f"{config.SUPABASE_URL}/rest/v1",
        headers={
            "apikey": config.SUPABASE_SERVICE_KEY,
            "authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
            "content-type": "application/json",
        },
        timeout=httpx.Timeout(15.0),
    )


# ---- accounts ----

async def create_guild_user(display_name: str | None = None) -> str:
    """An account owned by a guild.

    No email and no password, so it cannot be signed into on the web. The
    check constraint on uwufeed_users enforces that.
    """
    async with _client() as client:
        res = await client.post(
            "/uwufeed_users",
            headers={"prefer": "return=representation"},
            json=[{"origin": "discord", "display_name": display_name}],
        )
        res.raise_for_status()
        return res.json()[0]["id"]


async def user_exists(user_id: str) -> bool:
    async with _client() as client:
        res = await client.get("/uwufeed_users", params={"id": f"eq.{user_id}", "select": "id"})
        res.raise_for_status()
        return bool(res.json())


async def merge_user(from_user: str, into_user: str) -> dict:
    """Move a guild account's subscriptions and targets into a web account.

    Copy then delete, rather than repointing user_id: the unique
    constraints would reject a row the destination already has, and an
    ignored duplicate is the right outcome there.
    """
    moved = {"subscriptions": 0, "targets": 0}

    async with _client() as client:
        subs = await client.get(
            "/uwufeed_subscriptions", params={"user_id": f"eq.{from_user}", "select": "source_id"}
        )
        subs.raise_for_status()
        rows = [{"user_id": into_user, "source_id": s["source_id"]} for s in subs.json()]
        if rows:
            res = await client.post(
                "/uwufeed_subscriptions",
                params={"on_conflict": "user_id,source_id"},
                headers={"prefer": "resolution=ignore-duplicates,return=representation"},
                json=rows,
            )
            res.raise_for_status()
            moved["subscriptions"] = len(res.json())

        targets = await client.get(
            "/uwufeed_targets",
            params={"user_id": f"eq.{from_user}", "select": "channel,target_ref,active"},
        )
        targets.raise_for_status()
        rows = [{"user_id": into_user, **t} for t in targets.json()]
        if rows:
            res = await client.post(
                "/uwufeed_targets",
                params={"on_conflict": "user_id,channel,target_ref"},
                headers={"prefer": "resolution=ignore-duplicates,return=representation"},
                json=rows,
            )
            res.raise_for_status()
            moved["targets"] = len(res.json())

        await client.delete("/uwufeed_users", params={"id": f"eq.{from_user}"})

    return moved


# ---- targets ----

async def ensure_webhook_target(user_id: str, webhook_url: str) -> int:
    async with _client() as client:
        found = await client.get(
            "/uwufeed_targets",
            params={
                "user_id": f"eq.{user_id}",
                "channel": "eq.discord",
                "target_ref": f"eq.{webhook_url}",
                "select": "id",
            },
        )
        found.raise_for_status()
        if found.json():
            return int(found.json()[0]["id"])

        created = await client.post(
            "/uwufeed_targets",
            headers={"prefer": "return=representation"},
            json=[{"user_id": user_id, "channel": "discord", "target_ref": webhook_url}],
        )
        created.raise_for_status()
        return int(created.json()[0]["id"])


async def targets(user_id: str) -> list[dict]:
    async with _client() as client:
        res = await client.get(
            "/uwufeed_targets",
            params={"user_id": f"eq.{user_id}", "select": "id,channel,target_ref,active",
                    "order": "created_at.asc"},
        )
        res.raise_for_status()
        return res.json()


async def set_targets_active(user_id: str, active: bool, channel: str = "discord") -> None:
    """Pausing is a delivery decision, so it lives where the dispatcher looks."""
    async with _client() as client:
        res = await client.patch(
            "/uwufeed_targets",
            params={"user_id": f"eq.{user_id}", "channel": f"eq.{channel}"},
            headers={"prefer": "return=minimal"},
            json={"active": active},
        )
        res.raise_for_status()


# ---- sources and subscriptions ----

async def resolve_source(url: str) -> dict:
    """Hand the URL to the site, which owns hub detection."""
    if not config.PUBLIC_BASE_URL or not config.ADMIN_TOKEN:
        raise RuntimeError("PUBLIC_BASE_URL and ADMIN_TOKEN are required to add sources")

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        res = await client.post(
            f"{config.PUBLIC_BASE_URL}/api/sources/resolve",
            headers={"authorization": f"Bearer {config.ADMIN_TOKEN}"},
            json={"url": url},
        )
        if res.status_code >= 400:
            try:
                return {"error": res.json().get("error", f"http_{res.status_code}")}
            except Exception:
                return {"error": f"http_{res.status_code}"}
        return res.json()


async def count_subscriptions(user_id: str) -> int:
    async with _client() as client:
        res = await client.get(
            "/uwufeed_subscriptions",
            params={"user_id": f"eq.{user_id}", "select": "id"},
            headers={"prefer": "count=exact", "range": "0-0"},
        )
        total = (res.headers.get("content-range") or "").split("/")[-1]
        return int(total) if total.isdigit() else 0


async def subscribe(user_id: str, source_id: int) -> bool:
    """False means this account already followed it."""
    async with _client() as client:
        res = await client.post(
            "/uwufeed_subscriptions",
            params={"on_conflict": "user_id,source_id"},
            headers={"prefer": "resolution=ignore-duplicates,return=representation"},
            json=[{"user_id": user_id, "source_id": source_id}],
        )
        res.raise_for_status()
        return bool(res.json())


async def unsubscribe(user_id: str, source_id: int) -> None:
    """Drops the subscription only. The source row is shared and stays."""
    async with _client() as client:
        res = await client.delete(
            "/uwufeed_subscriptions",
            params={"user_id": f"eq.{user_id}", "source_id": f"eq.{source_id}"},
        )
        res.raise_for_status()


async def subscriptions(user_id: str) -> list[dict]:
    async with _client() as client:
        res = await client.get(
            "/uwufeed_subscriptions",
            params={
                "user_id": f"eq.{user_id}",
                "select": "id,source_id,uwufeed_sources(id,title,feed_url,platform,tier,"
                          "lease_expires_at,fail_count,retired_at),"
                          "uwufeed_subscription_targets(target_id)",
                "order": "source_id.asc",
            },
        )
        res.raise_for_status()
        rows = []
        for row in res.json():
            source = row.get("uwufeed_sources")
            if not source:
                continue
            source["subscription_id"] = row["id"]
            source["target_ids"] = [
                int(r["target_id"]) for r in (row.get("uwufeed_subscription_targets") or [])
            ]
            rows.append(source)
        return rows


async def set_routing(subscription_id: int, target_ids: list[int]) -> None:
    """No rows means every destination, which is the default."""
    async with _client() as client:
        res = await client.delete(
            "/uwufeed_subscription_targets",
            params={"subscription_id": f"eq.{subscription_id}"},
        )
        res.raise_for_status()
        if target_ids:
            res = await client.post(
                "/uwufeed_subscription_targets",
                params={"on_conflict": "subscription_id,target_id"},
                headers={"prefer": "resolution=ignore-duplicates,return=minimal"},
                json=[{"subscription_id": subscription_id, "target_id": t} for t in target_ids],
            )
            res.raise_for_status()


async def latest_items(user_id: str, limit: int = 10) -> list[dict]:
    source_ids = [s["id"] for s in await subscriptions(user_id)]
    if not source_ids:
        return []

    async with _client() as client:
        res = await client.get(
            "/uwufeed_items",
            params={
                "source_id": f"in.({','.join(str(i) for i in source_ids)})",
                "select": "title,url,author,kind,published_at,source_id",
                "order": "published_at.desc.nullslast",
                "limit": str(limit),
            },
        )
        res.raise_for_status()
        return res.json()
