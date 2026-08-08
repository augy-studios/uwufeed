"""Operational alerts from the workers, to the same webhook the crons use.

Shared with main-site/api/_lib/alert.js in intent, not in code: the two
halves cannot import each other. Both post an embed to
DISCORD_WEBHOOK_URL and both swallow their own failures, because alerting
must never be the thing that breaks the job it is reporting on.
"""

import os
from datetime import datetime, timezone

import httpx

COLOURS = {"warn": 0xFFCCCC, "info": 0xCCCCFF, "ok": 0xCCFFCC}


async def alert(title: str, lines: list[str], level: str = "warn") -> bool:
    url = os.environ.get("DISCORD_WEBHOOK_URL", "")
    if not url:
        return False

    body = {
        "embeds": [
            {
                "title": title[:256],
                "description": "\n".join(x for x in lines if x)[:4000],
                "color": COLOURS.get(level, COLOURS["warn"]),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "footer": {"text": "uwuFeed workers"},
            }
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, json=body)
            return res.status_code in (200, 204)
    except Exception as err:
        print(f"alert failed: {type(err).__name__}: {err}")
        return False
