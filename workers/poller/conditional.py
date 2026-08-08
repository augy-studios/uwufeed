"""Conditional requests. A 304 is cheap and most feeds honour them.

This is the single biggest reason polling thousands of feeds is
affordable, so the etag and last-modified round trip is not optional
politeness, it is the economics of the poll tier.
"""

import os
from dataclasses import dataclass

import httpx

USER_AGENT = "uwuFeed/0.1 (+{base}; {contact})".format(
    base=os.environ.get("PUBLIC_BASE_URL", "https://feed.uwuapps.org"),
    contact=os.environ.get("USER_AGENT_CONTACT", "contact not configured"),
)

ACCEPT = (
    "application/atom+xml, application/rss+xml, application/xml;q=0.9, "
    "text/xml;q=0.9, */*;q=0.5"
)

TIMEOUT = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=5.0)

# Bigger than any sane feed. A feed that exceeds this is either broken or
# hostile, and either way it is not worth the memory.
MAX_BYTES = 8 * 1024 * 1024


@dataclass
class FetchResult:
    ok: bool
    not_modified: bool = False
    status: int = 0
    body: bytes = b""
    etag: str | None = None
    last_modified: str | None = None
    error: str | None = None


async def fetch(client: httpx.AsyncClient, source: dict) -> FetchResult:
    headers = {"user-agent": USER_AGENT, "accept": ACCEPT}
    if source.get("etag"):
        headers["if-none-match"] = source["etag"]
    if source.get("last_modified"):
        headers["if-modified-since"] = source["last_modified"]

    try:
        res = await client.get(
            source["feed_url"], headers=headers, timeout=TIMEOUT, follow_redirects=True
        )
    except httpx.HTTPError as err:
        return FetchResult(ok=False, error=f"transport: {type(err).__name__}")

    # Nothing changed. Cheapest possible outcome, and the common one.
    if res.status_code == 304:
        return FetchResult(
            ok=True,
            not_modified=True,
            status=304,
            etag=source.get("etag"),
            last_modified=source.get("last_modified"),
        )

    if res.status_code != 200:
        return FetchResult(ok=False, status=res.status_code, error=f"http {res.status_code}")

    body = res.content
    if len(body) > MAX_BYTES:
        return FetchResult(ok=False, status=200, error="body too large")

    return FetchResult(
        ok=True,
        status=200,
        body=body,
        # Only carry a validator forward if the server actually sent one.
        # Reusing the old value against a new body causes a permanent 304.
        etag=res.headers.get("etag"),
        last_modified=res.headers.get("last-modified"),
    )
