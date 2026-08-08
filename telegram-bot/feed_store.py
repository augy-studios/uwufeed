"""Read and write feed data in Supabase.

Sources, items and subscriptions live in Postgres, shared with the site and
the Discord bot. They are never copied into SQLite. This module is the only
place in the bot that talks to Supabase.

TODO Phase 3. Planned surface:
    resolve_source(url)                  -> source row, tier decided by hub
    subscribe(user_id, source_id)        -> uwufeed_subscriptions row
    unsubscribe(user_id, source_id)      -> None
    subscriptions(user_id)               -> list of source rows
    latest_items(user_id, limit=10)      -> list of item rows
    source_health(user_id)               -> tier, lease, last check, retired
"""

import httpx

from config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL


def client() -> httpx.AsyncClient:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return httpx.AsyncClient(
        base_url=f"{SUPABASE_URL}/rest/v1",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "content-type": "application/json",
        },
        timeout=httpx.Timeout(15.0),
    )
