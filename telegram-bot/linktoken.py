"""Verify account link tokens issued by the site.

Mirrors main-site/api/_lib/linktoken.js exactly. The site signs, the bot
verifies, and neither needs to talk to the other.

Layout, base64url of: version | user uuid (16 bytes) | expiry (4 bytes,
unix seconds) | truncated HMAC-SHA256 (10 bytes).

Change one side and you must change the other. There is a cross language
test for exactly that reason.
"""

import base64
import hmac
import time
from hashlib import sha256
from uuid import UUID

VERSION = 1
MAC_BYTES = 10
PAYLOAD_BYTES = 21


def _mac(payload: bytes, secret: str) -> bytes:
    return hmac.new(secret.encode(), payload, sha256).digest()[:MAC_BYTES]


def verify(token: str, secret: str) -> str | None:
    """Return the user id, or None. Never raises: this is given user input."""
    if not token or not secret:
        return None

    text = str(token).strip()
    try:
        # base64url without padding, which is what the site emits.
        raw = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except Exception:
        return None

    if len(raw) != PAYLOAD_BYTES + MAC_BYTES:
        return None

    payload, supplied = raw[:PAYLOAD_BYTES], raw[PAYLOAD_BYTES:]
    if payload[0] != VERSION:
        return None

    if not hmac.compare_digest(supplied, _mac(payload, secret)):
        return None

    expires_at = int.from_bytes(payload[17:21], "big")
    if expires_at < int(time.time()):
        return None

    return str(UUID(bytes=payload[1:17]))
